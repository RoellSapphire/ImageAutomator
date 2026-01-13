// Google Drive integration using OAuth
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const TOKENS_FILE = path.join(process.cwd(), 'drive-tokens.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

interface DriveTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

let cachedTokens: DriveTokens | null = null;

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  const redirectUri = getRedirectUri();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getRedirectUri(): string {
  // Prioritize REPLIT_DEV_DOMAIN as it's the current dev URL format
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/drive/oauth/callback`;
  }
  return 'http://localhost:5000/api/drive/oauth/callback';
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function handleOAuthCallback(code: string): Promise<DriveTokens> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  const driveTokens: DriveTokens = {
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token || '',
    expiry_date: tokens.expiry_date || 0,
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope || '',
  };

  saveTokens(driveTokens);
  cachedTokens = driveTokens;
  
  return driveTokens;
}

function saveTokens(tokens: DriveTokens): void {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error('Failed to save tokens:', error);
  }
}

function loadTokens(): DriveTokens | null {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load tokens:', error);
  }
  return null;
}

export function clearTokens(): void {
  cachedTokens = null;
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      fs.unlinkSync(TOKENS_FILE);
    }
  } catch (error) {
    console.error('Failed to clear tokens:', error);
  }
}

async function getAuthenticatedClient() {
  if (!cachedTokens) {
    cachedTokens = loadTokens();
  }

  if (!cachedTokens) {
    throw new Error('Not authenticated with Google Drive. Please connect your account.');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: cachedTokens.access_token,
    refresh_token: cachedTokens.refresh_token,
    expiry_date: cachedTokens.expiry_date,
  });

  if (cachedTokens.expiry_date && Date.now() >= cachedTokens.expiry_date - 60000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      cachedTokens = {
        ...cachedTokens,
        access_token: credentials.access_token || cachedTokens.access_token,
        expiry_date: credentials.expiry_date || cachedTokens.expiry_date,
      };
      saveTokens(cachedTokens);
      oauth2Client.setCredentials(cachedTokens);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      clearTokens();
      throw new Error('Session expired. Please reconnect your Google Drive.');
    }
  }

  return oauth2Client;
}

export async function getUncachableGoogleDriveClient() {
  const oauth2Client = await getAuthenticatedClient();
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function checkDriveConnection(): Promise<{ connected: boolean; email?: string }> {
  try {
    const drive = await getUncachableGoogleDriveClient();
    const response = await drive.about.get({ fields: 'user' });
    return { 
      connected: true, 
      email: response.data.user?.emailAddress || undefined 
    };
  } catch (error) {
    return { connected: false };
  }
}

export async function listFolders(parentId?: string): Promise<{ id: string; name: string; path: string }[]> {
  const drive = await getUncachableGoogleDriveClient();
  
  const query = parentId 
    ? `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    : `'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const allFolders: { id: string; name: string; path: string }[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name)',
      orderBy: 'name',
      pageSize: 100,
      pageToken,
    });

    const folders = (response.data.files || []).map(file => ({
      id: file.id || '',
      name: file.name || '',
      path: file.name || '',
    }));

    allFolders.push(...folders);
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return allFolders;
}

export async function findOrCreateFolder(folderPath: string): Promise<string> {
  const drive = await getUncachableGoogleDriveClient();
  const pathParts = folderPath.split('/').filter(p => p.length > 0);
  
  let parentId = 'root';
  
  for (const folderName of pathParts) {
    const query = `'${parentId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
    });

    if (response.data.files && response.data.files.length > 0) {
      parentId = response.data.files[0].id || 'root';
    } else {
      const createResponse = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      });
      parentId = createResponse.data.id || 'root';
    }
  }
  
  return parentId;
}

export async function uploadFileToDrive(
  filePath: string,
  fileName: string,
  mimeType: string,
  folderId: string
): Promise<{ id: string; webViewLink: string }> {
  const drive = await getUncachableGoogleDriveClient();
  
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });

  return {
    id: response.data.id || '',
    webViewLink: response.data.webViewLink || '',
  };
}
