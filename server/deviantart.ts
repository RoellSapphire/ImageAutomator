import FormData from 'form-data';
import { storage } from './storage';
import type { ScheduledUpload } from '@shared/schema';

const DEVIANTART_API_BASE = 'https://www.deviantart.com/api/v1/oauth2';
const DEVIANTART_AUTH_URL = 'https://www.deviantart.com/oauth2/authorize';
const DEVIANTART_TOKEN_URL = 'https://www.deviantart.com/oauth2/token';

export interface DeviantArtTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface StashSubmitResponse {
  status: string;
  itemid: number;
  stack: string;
  stackid: number;
}

export interface StashPublishResponse {
  status: string;
  url: string;
  deviationid: string;
}

let uploadInterval: NodeJS.Timeout | null = null;

export function getAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'stash publish',
    state: state,
  });
  return `${DEVIANTART_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<DeviantArtTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(DEVIANTART_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return await response.json() as DeviantArtTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<DeviantArtTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(DEVIANTART_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return await response.json() as DeviantArtTokenResponse;
}

export async function submitToStash(
  accessToken: string,
  imageBuffer: Buffer,
  filename: string,
  title: string,
  description: string
): Promise<StashSubmitResponse> {
  const form = new FormData();
  form.append('title', title);
  form.append('artist_comments', description);
  form.append('access_token', accessToken);
  form.append('file', imageBuffer, {
    filename: filename,
    contentType: 'image/png',
  });

  const response = await fetch(`${DEVIANTART_API_BASE}/stash/submit`, {
    method: 'POST',
    body: form as any,
    headers: form.getHeaders(),
  });

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`Stash submit failed: ${result.error_description || result.error}`);
  }

  return result as StashSubmitResponse;
}

export async function publishFromStash(
  accessToken: string,
  stashId: number,
  category: string = 'digitalart/drawings',
  isMature: boolean = false
): Promise<StashPublishResponse> {
  const params = new URLSearchParams({
    stashid: stashId.toString(),
    is_mature: isMature ? '1' : '0',
    agree_submission: '1',
    agree_tos: '1',
    catpath: category,
    access_token: accessToken,
  });

  if (isMature) {
    params.append('mature_level', 'moderate');
  }

  const response = await fetch(`${DEVIANTART_API_BASE}/stash/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`Publish failed: ${result.error_description || result.error}`);
  }

  return result as StashPublishResponse;
}

export async function uploadAndPublish(
  accessToken: string,
  imageBuffer: Buffer,
  filename: string,
  title: string,
  description: string,
  category: string = 'digitalart/drawings',
  isMature: boolean = false
): Promise<{ stashResponse: StashSubmitResponse; publishResponse: StashPublishResponse }> {
  const stashResponse = await submitToStash(accessToken, imageBuffer, filename, title, description);
  const publishResponse = await publishFromStash(accessToken, stashResponse.itemid, category, isMature);
  return { stashResponse, publishResponse };
}

// Scheduling functions using persisted storage
export async function getScheduledUploads(): Promise<ScheduledUpload[]> {
  const settings = await storage.getUserSettings();
  return settings.scheduledUploads || [];
}

export async function addScheduledUpload(upload: Omit<ScheduledUpload, 'id' | 'status'>): Promise<ScheduledUpload> {
  const settings = await storage.getUserSettings();
  const uploads = settings.scheduledUploads || [];
  
  const newUpload: ScheduledUpload = {
    ...upload,
    id: `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    status: 'pending',
  };
  
  uploads.push(newUpload);
  settings.scheduledUploads = uploads;
  await storage.saveUserSettings(settings);
  
  return newUpload;
}

export async function removeScheduledUpload(id: string): Promise<boolean> {
  const settings = await storage.getUserSettings();
  const uploads = settings.scheduledUploads || [];
  
  const index = uploads.findIndex((u: ScheduledUpload) => u.id === id);
  if (index !== -1) {
    uploads.splice(index, 1);
    settings.scheduledUploads = uploads;
    await storage.saveUserSettings(settings);
    return true;
  }
  return false;
}

export async function updateScheduledUpload(id: string, updates: Partial<ScheduledUpload>): Promise<ScheduledUpload | null> {
  const settings = await storage.getUserSettings();
  const uploads = settings.scheduledUploads || [];
  
  const index = uploads.findIndex((u: ScheduledUpload) => u.id === id);
  if (index !== -1) {
    uploads[index] = { ...uploads[index], ...updates };
    settings.scheduledUploads = uploads;
    await storage.saveUserSettings(settings);
    return uploads[index];
  }
  return null;
}

export async function clearCompletedUploads(): Promise<number> {
  const settings = await storage.getUserSettings();
  const uploads = settings.scheduledUploads || [];
  
  const before = uploads.length;
  settings.scheduledUploads = uploads.filter((u: ScheduledUpload) => u.status === 'pending' || u.status === 'uploading');
  await storage.saveUserSettings(settings);
  
  return before - (settings.scheduledUploads?.length || 0);
}

export function startScheduler(
  accessToken: string,
  intervalMinutes: number = 60,
  onUploadComplete?: (upload: ScheduledUpload) => void
): void {
  if (uploadInterval) {
    clearInterval(uploadInterval);
  }

  const processUploads = async () => {
    const now = new Date();
    const uploads = await getScheduledUploads();
    const pendingUploads = uploads.filter(
      (u: ScheduledUpload) => u.status === 'pending' && new Date(u.scheduledTime) <= now
    );

    for (const upload of pendingUploads) {
      await updateScheduledUpload(upload.id, { status: 'uploading' });
      
      try {
        const response = await fetch(upload.imageUrl);
        const imageBuffer = Buffer.from(await response.arrayBuffer());

        const result = await uploadAndPublish(
          accessToken,
          imageBuffer,
          `image_${upload.id}.png`,
          upload.title,
          upload.description,
          upload.category,
          upload.isMature
        );

        await updateScheduledUpload(upload.id, { 
          status: 'published',
          publishedUrl: result.publishResponse.url,
        });
        
        if (onUploadComplete) {
          const updated = await getScheduledUploads();
          const completedUpload = updated.find((u: ScheduledUpload) => u.id === upload.id);
          if (completedUpload) onUploadComplete(completedUpload);
        }
      } catch (error: any) {
        await updateScheduledUpload(upload.id, { 
          status: 'failed',
          error: error.message,
        });
        console.error(`Failed to upload ${upload.id}:`, error);
      }
    }
  };

  processUploads();
  uploadInterval = setInterval(processUploads, intervalMinutes * 60 * 1000);
}

export function stopScheduler(): void {
  if (uploadInterval) {
    clearInterval(uploadInterval);
    uploadInterval = null;
  }
}

export function isSchedulerRunning(): boolean {
  return uploadInterval !== null;
}
