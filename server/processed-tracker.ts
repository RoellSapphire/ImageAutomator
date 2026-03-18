// Persistent tracker for processed image IDs
// Saves to a JSON file so the system remembers across restarts (30-day retention)
import fs from 'fs';
import path from 'path';

const TRACKER_FILE = path.join(process.cwd(), 'processed-tracker.json');
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SAVE_DEBOUNCE_MS = 5000; // Batch writes to avoid excessive disk I/O

interface TrackerData {
  // key = identifier (civitai compound ID or folder:filepath), value = timestamp when processed
  entries: Record<string, number>;
}

let data: TrackerData = { entries: {} };
let dirty = false;
let saveTimer: NodeJS.Timeout | null = null;

function load() {
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      const raw = fs.readFileSync(TRACKER_FILE, 'utf-8');
      data = JSON.parse(raw);
      pruneOldEntries();
      console.log(`[ProcessedTracker] Loaded ${Object.keys(data.entries).length} tracked entries`);
    }
  } catch (err) {
    console.error('[ProcessedTracker] Failed to load tracker file, starting fresh:', err);
    data = { entries: {} };
  }
}

function pruneOldEntries() {
  const cutoff = Date.now() - RETENTION_MS;
  let pruned = 0;
  for (const key of Object.keys(data.entries)) {
    if (data.entries[key] < cutoff) {
      delete data.entries[key];
      pruned++;
    }
  }
  if (pruned > 0) {
    console.log(`[ProcessedTracker] Pruned ${pruned} entries older than 30 days`);
    dirty = true;
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) {
      saveNow();
    }
  }, SAVE_DEBOUNCE_MS);
}

function saveNow() {
  try {
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2));
    dirty = false;
  } catch (err) {
    console.error('[ProcessedTracker] Failed to save:', err);
  }
}

/** Check if an ID has been processed before */
export function hasBeenProcessed(id: string): boolean {
  return id in data.entries;
}

/** Mark an ID as processed */
export function markProcessed(id: string): void {
  if (id in data.entries) return;
  data.entries[id] = Date.now();
  dirty = true;
  scheduleSave();
}

/** Mark multiple IDs as processed */
export function markProcessedBatch(ids: string[]): void {
  const now = Date.now();
  for (const id of ids) {
    if (!(id in data.entries)) {
      data.entries[id] = now;
      dirty = true;
    }
  }
  if (dirty) scheduleSave();
}

/** Remove all entries for a given prefix (e.g. a folder ID) */
export function clearByPrefix(prefix: string): void {
  for (const key of Object.keys(data.entries)) {
    if (key.startsWith(prefix)) {
      delete data.entries[key];
      dirty = true;
    }
  }
  if (dirty) scheduleSave();
}

/** Clear all tracked entries */
export function clearAll(): void {
  data.entries = {};
  dirty = true;
  saveNow();
}

/** Force an immediate save (call on shutdown) */
export function flushTracker(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dirty) saveNow();
}

/** Get count of tracked entries */
export function trackedCount(): number {
  return Object.keys(data.entries).length;
}

// Load on module init
load();
