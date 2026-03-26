// Folder watcher - monitors local directories for new images and auto-processes them
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { storage } from './storage';
import type { ProcessedImage, FolderMapping, DriveConfig } from '@shared/schema';
import { findOrCreateFolder, findOrCreateSubfolderById, uploadFileToDrive, checkDriveConnection, listImagesInFolder, downloadFileFromDrive } from './google-drive';
import { hasBeenProcessed, markProcessed, clearByPrefix, flushTracker } from './processed-tracker';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const PROCESSED_DIR = path.join(process.cwd(), 'processed');
const THUMBNAILS_DIR = path.join(process.cwd(), 'thumbnails');

// Processed files are now tracked persistently via processed-tracker
// Track files being written to (wait for them to stabilize)
const pendingFiles = new Map<string, { size: number; lastChanged: number }>();
// Processing queue - prevents concurrent uploads that overwhelm Drive API
const processingQueue: Array<{ filePath: string; watchedFolder: WatchedFolder; subfolder?: string }> = [];
let isProcessingQueue = false;

interface WatchedFolder {
  id: string;
  localPath: string;        // Local folder to watch (e.g., C:\Users\Mike\output\nsfw)
  driveInputPath?: string;  // Google Drive folder path as input source (polls Drive API instead of local fs)
  mappingId?: string;       // Link to a folder mapping for auto-routing
  driveConfig?: DriveConfig; // Direct drive config if no mapping
  enabled: boolean;
  pollIntervalMs: number;   // How often to check for new files (default 5000)
}

interface WatcherState {
  watchedFolders: WatchedFolder[];
  running: boolean;
}

let watcherState: WatcherState = {
  watchedFolders: [],
  running: false,
};

let pollTimers: Map<string, NodeJS.Timeout> = new Map();

// Event callback for notifying clients
type WatcherEventCallback = (event: WatcherEvent) => void;
let eventCallback: WatcherEventCallback | null = null;

export interface WatcherEvent {
  type: 'file_detected' | 'processing' | 'exported' | 'error' | 'complete';
  folderId: string;
  folderPath: string;
  fileName?: string;
  message: string;
  timestamp: string;
}

const recentEvents: WatcherEvent[] = [];
const MAX_EVENTS = 100;

function emitEvent(event: Omit<WatcherEvent, 'timestamp'>) {
  const fullEvent: WatcherEvent = { ...event, timestamp: new Date().toISOString() };
  recentEvents.unshift(fullEvent);
  if (recentEvents.length > MAX_EVENTS) recentEvents.pop();
  if (eventCallback) eventCallback(fullEvent);
  console.log(`[FolderWatcher] ${event.type}: ${event.message}`);
}

export function setWatcherEventCallback(cb: WatcherEventCallback | null) {
  eventCallback = cb;
}

export function getRecentEvents(): WatcherEvent[] {
  return recentEvents;
}

function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

// Check if file is done being written (size stable for 2 seconds)
function isFileStable(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    const key = filePath;
    const prev = pendingFiles.get(key);

    if (!prev || prev.size !== stats.size) {
      pendingFiles.set(key, { size: stats.size, lastChanged: Date.now() });
      return false;
    }

    // File size hasn't changed for 2 seconds
    if (Date.now() - prev.lastChanged >= 2000) {
      pendingFiles.delete(key);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (processingQueue.length > 0) {
    const item = processingQueue.shift()!;
    try {
      await withTimeout(
        processNewFile(item.filePath, item.watchedFolder, item.subfolder),
        120000, // 2 minute timeout per file
        `Processing ${path.basename(item.filePath)}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[FolderWatcher] Queue processing failed for ${item.filePath}:`, msg);
      emitEvent({
        type: 'error',
        folderId: item.watchedFolder.id,
        folderPath: item.watchedFolder.driveInputPath || item.watchedFolder.localPath,
        fileName: path.basename(item.filePath),
        message: `Failed: ${msg}`,
      });
    }
  }

  isProcessingQueue = false;
}

async function processNewFile(filePath: string, watchedFolder: WatchedFolder, subfolder?: string) {
  const fileName = path.basename(filePath);
  const displayPath = watchedFolder.driveInputPath || watchedFolder.localPath;

  emitEvent({
    type: 'file_detected',
    folderId: watchedFolder.id,
    folderPath: displayPath,
    fileName,
    message: `New image detected: ${subfolder ? subfolder + '/' : ''}${fileName}`,
  });

  try {
    // Create a workflow for this file
    const workflow = await storage.createWorkflow();
    const workflowUploadDir = path.join(UPLOAD_DIR, workflow.id);
    const workflowProcessedDir = path.join(PROCESSED_DIR, workflow.id);
    fs.mkdirSync(workflowUploadDir, { recursive: true });
    fs.mkdirSync(workflowProcessedDir, { recursive: true });

    // Copy file to upload dir
    const imageId = randomUUID();
    const destPath = path.join(workflowUploadDir, fileName);
    fs.copyFileSync(filePath, destPath);

    // Create thumbnail
    const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);
    try {
      await sharp(destPath)
        .resize(200, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);
    } catch (e) {
      console.error('[FolderWatcher] Thumbnail error:', e);
    }

    // Get dimensions
    let width = 0, height = 0;
    try {
      const metadata = await sharp(destPath).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
    } catch {}

    const stats = fs.statSync(destPath);
    const image: ProcessedImage = {
      id: imageId,
      originalName: fileName,
      newName: fileName,
      originalPath: destPath,
      processedPath: destPath, // Will be updated if enhancement runs
      thumbnailPath: `/api/thumbnails/${imageId}.jpg`,
      originalSize: stats.size,
      processedSize: stats.size,
      width,
      height,
      format: path.extname(fileName).slice(1).toLowerCase(),
      status: 'completed',
      subfolder,
    };

    await storage.addImages(workflow.id, [image]);
    await storage.updateWorkflow(workflow.id, {
      uploadedZipName: path.basename(displayPath),
      currentStep: 4, // Skip to export
    });

    emitEvent({
      type: 'processing',
      folderId: watchedFolder.id,
      folderPath: displayPath,
      fileName,
      message: `Processing ${fileName}...`,
    });

    // Determine drive config - from mapping or direct config
    let driveConfig: DriveConfig | undefined = watchedFolder.driveConfig;

    if (watchedFolder.mappingId) {
      const settings = await storage.getUserSettings();
      const mapping = (settings.folderMappings || []).find(m => m.id === watchedFolder.mappingId);
      if (mapping?.driveConfig) {
        driveConfig = mapping.driveConfig;
      }
    }

    // Export to Google Drive if configured
    if (driveConfig && (driveConfig.folderId || driveConfig.folderPath)) {
      const driveStatus = await checkDriveConnection();
      if (driveStatus.connected) {
        let targetFolderId: string;

        if (driveConfig.folderId) {
          targetFolderId = driveConfig.folderId;
          if (driveConfig.createSubfolder && driveConfig.subfolderName?.trim()) {
            targetFolderId = await findOrCreateSubfolderById(targetFolderId, driveConfig.subfolderName.trim());
          }
        } else {
          let folderPath = driveConfig.folderPath || '/Watched Uploads';
          if (driveConfig.createSubfolder && driveConfig.subfolderName) {
            folderPath = `${folderPath}/${driveConfig.subfolderName}`;
          }
          targetFolderId = await findOrCreateFolder(folderPath);
        }

        // Create subfolder on Drive if image has one (preserves model folder structure)
        let uploadFolderId = targetFolderId;
        if (subfolder) {
          let currentParent = targetFolderId;
          const parts = subfolder.split('/').filter(Boolean);
          for (const part of parts) {
            currentParent = await findOrCreateSubfolderById(currentParent, part);
          }
          uploadFolderId = currentParent;
        }

        const ext = path.extname(fileName).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' :
                        ext === '.webp' ? 'image/webp' :
                        ext === '.gif' ? 'image/gif' :
                        'image/jpeg';

        const result = await uploadFileToDrive(destPath, fileName, mimeType, uploadFolderId);

        emitEvent({
          type: 'exported',
          folderId: watchedFolder.id,
          folderPath: displayPath,
          fileName,
          message: `Exported ${fileName} to Google Drive (ID: ${result.id})`,
        });
      } else {
        emitEvent({
          type: 'error',
          folderId: watchedFolder.id,
          folderPath: displayPath,
          fileName,
          message: `Google Drive not connected - skipped export for ${fileName}`,
        });
      }
    }

    emitEvent({
      type: 'complete',
      folderId: watchedFolder.id,
      folderPath: displayPath,
      fileName,
      message: `Completed processing ${fileName}`,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    emitEvent({
      type: 'error',
      folderId: watchedFolder.id,
      folderPath: displayPath,
      fileName,
      message: `Error processing ${fileName}: ${msg}`,
    });
  }
}

function scanDirectory(dirPath: string, rootPath: string, watchedFolder: WatchedFolder) {
  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Recurse into subdirectories
      scanDirectory(fullPath, rootPath, watchedFolder);
      continue;
    }

    if (!isImageFile(entry)) continue;

    const fileKey = `folder:${watchedFolder.id}:${fullPath}`;
    if (hasBeenProcessed(fileKey)) continue;

    if (!isFileStable(fullPath)) continue;

    markProcessed(fileKey);

    // Compute subfolder relative to the watched root
    const relative = path.relative(rootPath, dirPath);
    const subfolder = relative && relative !== '.' ? relative.replace(/\\/g, '/') : undefined;

    processingQueue.push({ filePath: fullPath, watchedFolder, subfolder });
  }
}

function pollFolder(watchedFolder: WatchedFolder) {
  if (!watchedFolder.enabled) return;

  try {
    if (!fs.existsSync(watchedFolder.localPath)) {
      return;
    }

    scanDirectory(watchedFolder.localPath, watchedFolder.localPath, watchedFolder);

    // Kick off queue processing if items were added
    if (processingQueue.length > 0) {
      processQueue().catch(err => {
        console.error('[FolderWatcher] Queue processing error:', err);
      });
    }
  } catch (error) {
    // Folder might not exist yet, that's ok
  }
}

async function pollDriveFolder(watchedFolder: WatchedFolder) {
  if (!watchedFolder.enabled || !watchedFolder.driveInputPath) return;

  try {
    const driveStatus = await checkDriveConnection();
    if (!driveStatus.connected) return;

    // Resolve Drive input path to a folder ID
    const inputFolderId = await findOrCreateFolder(watchedFolder.driveInputPath);

    const files = await listImagesInFolder(inputFolderId);

    for (const file of files) {
      const fileKey = `folder:${watchedFolder.id}:drive:${file.id}`;
      if (hasBeenProcessed(fileKey)) continue;

      // Mark immediately to avoid double-processing
      markProcessed(fileKey);

      // Download the file to a temp location
      const tempDir = path.join(process.cwd(), 'temp-drive-downloads');
      fs.mkdirSync(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, file.name);

      try {
        await downloadFileFromDrive(file.id, tempPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        emitEvent({
          type: 'error',
          folderId: watchedFolder.id,
          folderPath: watchedFolder.driveInputPath || '',
          fileName: file.name,
          message: `Failed to download ${file.name} from Drive: ${msg}`,
        });
        continue;
      }

      // Add to queue for sequential processing
      processingQueue.push({ filePath: tempPath, watchedFolder });
    }

    if (processingQueue.length > 0) {
      processQueue().catch(err => {
        console.error('[FolderWatcher] Queue processing error:', err);
      });
    }
  } catch (error) {
    // Drive might not be connected or folder doesn't exist
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FolderWatcher] Drive poll error for ${watchedFolder.driveInputPath}:`, msg);
  }
}

function startPolling(watchedFolder: WatchedFolder) {
  stopPolling(watchedFolder.id);

  if (!watchedFolder.enabled) return;

  const isDriveInput = !!watchedFolder.driveInputPath;
  const interval = watchedFolder.pollIntervalMs || (isDriveInput ? 15000 : 5000); // Slower default for Drive API
  const pollFn = isDriveInput ? () => pollDriveFolder(watchedFolder) : () => pollFolder(watchedFolder);
  const timer = setInterval(pollFn, interval);
  pollTimers.set(watchedFolder.id, timer);

  // Do an initial poll
  pollFn();

  const displayPath = isDriveInput ? `Drive:${watchedFolder.driveInputPath}` : watchedFolder.localPath;
  console.log(`[FolderWatcher] Started watching: ${displayPath} (every ${interval}ms)`);
}

function stopPolling(folderId: string) {
  const timer = pollTimers.get(folderId);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(folderId);
  }
}

// Public API

export async function getWatchedFolders(): Promise<WatchedFolder[]> {
  const settings = await storage.getUserSettings();
  return (settings as any).watchedFolders || [];
}

export async function saveWatchedFolders(folders: WatchedFolder[]): Promise<void> {
  const settings = await storage.getUserSettings();
  (settings as any).watchedFolders = folders;
  await storage.saveUserSettings(settings as any);
}

export async function addWatchedFolder(folder: Omit<WatchedFolder, 'id'>): Promise<WatchedFolder> {
  const newFolder: WatchedFolder = { ...folder, id: randomUUID() };
  const folders = await getWatchedFolders();
  folders.push(newFolder);
  await saveWatchedFolders(folders);

  if (watcherState.running && newFolder.enabled) {
    startPolling(newFolder);
  }

  return newFolder;
}

export async function updateWatchedFolder(id: string, updates: Partial<WatchedFolder>): Promise<WatchedFolder | null> {
  const folders = await getWatchedFolders();
  const index = folders.findIndex(f => f.id === id);
  if (index === -1) return null;

  folders[index] = { ...folders[index], ...updates, id };
  await saveWatchedFolders(folders);

  if (watcherState.running) {
    startPolling(folders[index]);
  }

  return folders[index];
}

export async function removeWatchedFolder(id: string): Promise<boolean> {
  const folders = await getWatchedFolders();
  const filtered = folders.filter(f => f.id !== id);
  if (filtered.length === folders.length) return false;

  stopPolling(id);
  await saveWatchedFolders(filtered);
  return true;
}

export async function startWatcher(): Promise<void> {
  if (watcherState.running) return;

  watcherState.running = true;
  const folders = await getWatchedFolders();
  watcherState.watchedFolders = folders;

  for (const folder of folders) {
    if (folder.enabled) {
      // Mark existing files as already processed so we only pick up NEW ones
      markExistingFiles(folder);
      startPolling(folder);
    }
  }

  console.log(`[FolderWatcher] Started watching ${folders.filter(f => f.enabled).length} folder(s)`);
}

async function markExistingFiles(watchedFolder: WatchedFolder) {
  if (watchedFolder.driveInputPath) {
    // For Drive input folders, mark existing files by Drive file ID
    try {
      const driveStatus = await checkDriveConnection();
      if (!driveStatus.connected) return;
      const inputFolderId = await findOrCreateFolder(watchedFolder.driveInputPath);
      const files = await listImagesInFolder(inputFolderId);
      for (const file of files) {
        markProcessed(`folder:${watchedFolder.id}:drive:${file.id}`);
      }
    } catch {}
    return;
  }

  try {
    if (!fs.existsSync(watchedFolder.localPath)) return;
    const files = fs.readdirSync(watchedFolder.localPath);
    for (const file of files) {
      if (isImageFile(file)) {
        const filePath = path.join(watchedFolder.localPath, file);
        markProcessed(`folder:${watchedFolder.id}:${filePath}`);
      }
    }
  } catch {}
}

export function stopWatcher(): void {
  watcherState.running = false;
  Array.from(pollTimers.keys()).forEach(id => stopPolling(id));
  flushTracker(); // Save any pending tracked entries to disk
  pendingFiles.clear();
  processingQueue.length = 0;
  isProcessingQueue = false;
  console.log('[FolderWatcher] Stopped all watchers');
}

export function isWatcherRunning(): boolean {
  return watcherState.running;
}

// Clear processed files cache for a folder (allows re-processing)
export function resetFolder(folderId: string): void {
  clearByPrefix(`folder:${folderId}:`);
}
