// Civitai Auto-Fetch - polls Civitai for new images, buffers them, and triggers processing
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { storage } from './storage';
import type { ProcessedImage, CivitaiAutoFetchSettings, WorkflowPreset } from '@shared/schema';
import { getGenerationFeed, downloadImage, deleteGeneratedImages, getCivitaiUser } from './civitai';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.join(process.cwd(), 'thumbnails');

interface BufferedImage {
  id: string;       // Civitai compound ID (workflowId_stepIndex_imageIndex)
  batchId: string;  // Original Civitai workflow ID for deletion
  url: string;
  width: number;
  height: number;
  createdAt: string;
  fetchedAt: string;
}

interface AutoFetchState {
  running: boolean;
  buffer: BufferedImage[];
  lastSeenId: string | null;
  totalFetched: number;
  totalProcessed: number;
  lastPollAt: string | null;
  lastError: string | null;
}

let state: AutoFetchState = {
  running: false,
  buffer: [],
  lastSeenId: null,
  totalFetched: 0,
  totalProcessed: 0,
  lastPollAt: null,
  lastError: null,
};

// Track Civitai image IDs we've already seen/fetched
const seenImageIds = new Set<string>();

let pollTimer: NodeJS.Timeout | null = null;
let isPolling = false;

// Callback to trigger auto-mode processing on the frontend/workflow
type BatchReadyCallback = (workflowId: string, imageCount: number) => void;
let batchReadyCallback: BatchReadyCallback | null = null;

export function setBatchReadyCallback(cb: BatchReadyCallback | null) {
  batchReadyCallback = cb;
}

export function getAutoFetchStatus() {
  return {
    running: state.running,
    bufferCount: state.buffer.length,
    totalFetched: state.totalFetched,
    totalProcessed: state.totalProcessed,
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
    buffer: state.buffer.map(img => ({
      id: img.id,
      url: img.url,
      width: img.width,
      height: img.height,
      createdAt: img.createdAt,
      fetchedAt: img.fetchedAt,
    })),
  };
}

async function pollCivitai() {
  if (isPolling) return;
  isPolling = true;

  try {
    const apiKey = process.env.CIVITAI_API_KEY;
    if (!apiKey) {
      state.lastError = 'No CIVITAI_API_KEY configured';
      return;
    }

    console.log('[CivitaiAutoFetch] Polling for new images...');
    state.lastPollAt = new Date().toISOString();

    const response = await getGenerationFeed(apiKey, { sort: 'Newest' });

    let newCount = 0;
    for (const item of response.items) {
      // Extract all available images from all steps
      for (let stepIdx = 0; stepIdx < (item.steps?.length || 0); stepIdx++) {
        const step = item.steps![stepIdx];
        for (let imgIdx = 0; imgIdx < (step.images?.length || 0); imgIdx++) {
          const img = step.images![imgIdx];
          if (!img.available || !img.url) continue;

          const compoundId = `${item.id}_${stepIdx}_${imgIdx}`;

          if (seenImageIds.has(compoundId)) continue;
          seenImageIds.add(compoundId);

          state.buffer.push({
            id: compoundId,
            batchId: item.id,
            url: img.url,
            width: item.params?.width || 0,
            height: item.params?.height || 0,
            createdAt: item.createdAt,
            fetchedAt: new Date().toISOString(),
          });

          newCount++;
          state.totalFetched++;
        }
      }
    }

    if (newCount > 0) {
      console.log(`[CivitaiAutoFetch] Found ${newCount} new images. Buffer: ${state.buffer.length}`);
    }

    state.lastError = null;

    // Check if we've hit the threshold
    const settings = await storage.getUserSettings();
    const fetchSettings = settings.civitaiAutoFetchSettings;
    if (fetchSettings && state.buffer.length >= fetchSettings.batchThreshold) {
      console.log(`[CivitaiAutoFetch] Threshold reached (${state.buffer.length}/${fetchSettings.batchThreshold}). Processing batch...`);
      await processBatch(fetchSettings);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    state.lastError = msg;
    console.error('[CivitaiAutoFetch] Poll error:', msg);
  } finally {
    isPolling = false;
  }
}

async function processBatch(fetchSettings: CivitaiAutoFetchSettings) {
  const batch = state.buffer.splice(0, fetchSettings.batchThreshold);
  if (batch.length === 0) return;

  try {
    const apiKey = process.env.CIVITAI_API_KEY;

    // Download all images and create a workflow
    const workflowId = randomUUID();
    const workflowDir = path.join(UPLOAD_DIR, workflowId);
    fs.mkdirSync(workflowDir, { recursive: true });

    const images: ProcessedImage[] = [];

    for (const buffered of batch) {
      try {
        const imageBuffer = await downloadImage(buffered.url);
        const imageId = randomUUID();
        const ext = '.jpg';
        const imagePath = path.join(workflowDir, `${imageId}${ext}`);

        fs.writeFileSync(imagePath, imageBuffer);

        // Create thumbnail
        const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);
        try {
          await sharp(imagePath)
            .resize(200, 200, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);
        } catch {}

        // Get dimensions
        let width = buffered.width, height = buffered.height;
        try {
          const metadata = await sharp(imagePath).metadata();
          width = metadata.width || width;
          height = metadata.height || height;
        } catch {}

        const stats = fs.statSync(imagePath);
        images.push({
          id: imageId,
          originalName: `civitai_${buffered.id}.jpg`,
          newName: `civitai_${buffered.id}.jpg`,
          originalPath: imagePath,
          originalSize: stats.size,
          width,
          height,
          format: 'jpeg',
          status: 'pending',
        });
      } catch (err) {
        console.error(`[CivitaiAutoFetch] Failed to download ${buffered.id}:`, err);
      }
    }

    if (images.length === 0) {
      console.error('[CivitaiAutoFetch] No images downloaded from batch');
      return;
    }

    // Create workflow in storage
    const workflow = await storage.createWorkflow();
    // Move files to the correct workflow dir
    const correctDir = path.join(UPLOAD_DIR, workflow.id);
    if (workflowDir !== correctDir) {
      fs.mkdirSync(correctDir, { recursive: true });
      for (const img of images) {
        const newPath = path.join(correctDir, path.basename(img.originalPath));
        fs.renameSync(img.originalPath, newPath);
        img.originalPath = newPath;
      }
      try { fs.rmdirSync(workflowDir); } catch {}
    }

    await storage.addImages(workflow.id, images);

    // Delete from Civitai if requested
    if (fetchSettings.deleteAfterFetch && apiKey) {
      const batchIds = Array.from(new Set(batch.map(b => b.batchId)));
      console.log(`[CivitaiAutoFetch] Deleting ${batchIds.length} batch(es) from Civitai`);
      try {
        await deleteGeneratedImages(apiKey, batchIds);
      } catch (err) {
        console.error('[CivitaiAutoFetch] Delete error:', err);
      }
    }

    state.totalProcessed += images.length;
    console.log(`[CivitaiAutoFetch] Batch ready: workflow ${workflow.id} with ${images.length} images`);

    // Notify that a batch is ready for auto-mode processing
    if (batchReadyCallback) {
      batchReadyCallback(workflow.id, images.length);
    }

  } catch (error) {
    console.error('[CivitaiAutoFetch] Batch processing error:', error);
    // Put images back in buffer on failure
    state.buffer.unshift(...batch);
  }
}

export async function startAutoFetch(): Promise<void> {
  if (state.running) return;

  const settings = await storage.getUserSettings();
  const fetchSettings = settings.civitaiAutoFetchSettings;
  if (!fetchSettings?.enabled) return;

  const apiKey = process.env.CIVITAI_API_KEY;
  if (!apiKey) {
    throw new Error('No CIVITAI_API_KEY configured');
  }

  // Verify API key works
  const user = await getCivitaiUser(apiKey);
  if (!user) {
    throw new Error('Invalid Civitai API key');
  }

  state.running = true;
  state.lastError = null;

  // Do initial poll to seed the seen set (so we only pick up NEW images going forward)
  console.log('[CivitaiAutoFetch] Seeding initial image list...');
  try {
    const response = await getGenerationFeed(apiKey, { sort: 'Newest' });
    for (const item of response.items) {
      for (let stepIdx = 0; stepIdx < (item.steps?.length || 0); stepIdx++) {
        const step = item.steps![stepIdx];
        for (let imgIdx = 0; imgIdx < (step.images?.length || 0); imgIdx++) {
          const img = step.images![imgIdx];
          if (img.available && img.url) {
            seenImageIds.add(`${item.id}_${stepIdx}_${imgIdx}`);
          }
        }
      }
    }
    console.log(`[CivitaiAutoFetch] Seeded ${seenImageIds.size} existing images`);
  } catch (err) {
    console.error('[CivitaiAutoFetch] Seed error:', err);
  }

  const interval = fetchSettings.pollIntervalMs || 60000;
  pollTimer = setInterval(() => pollCivitai(), interval);

  console.log(`[CivitaiAutoFetch] Started (poll every ${interval / 1000}s, batch threshold: ${fetchSettings.batchThreshold})`);
}

export function stopAutoFetch(): void {
  state.running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isPolling = false;
  console.log('[CivitaiAutoFetch] Stopped');
}

export function clearAutoFetchBuffer(): BufferedImage[] {
  const cleared = [...state.buffer];
  state.buffer = [];
  return cleared;
}

export async function forceProcessBuffer(): Promise<{ workflowId: string; count: number } | null> {
  if (state.buffer.length === 0) return null;

  const settings = await storage.getUserSettings();
  const fetchSettings = settings.civitaiAutoFetchSettings || {
    enabled: false,
    pollIntervalMs: 60000,
    batchThreshold: 10,
    deleteAfterFetch: false,
    autoProcess: true,
  };

  // Process everything in the buffer regardless of threshold
  const overrideSettings = { ...fetchSettings, batchThreshold: state.buffer.length };
  await processBatch(overrideSettings);

  return null; // The batch callback handles notification
}
