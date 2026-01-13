// Google Drive integration using Replit connector
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  try {
    if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
      return connectionSettings.settings.access_token;
    }
    
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    if (!hostname) {
      throw new Error('Google Drive connector not available: REPLIT_CONNECTORS_HOSTNAME is not set');
    }

    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      throw new Error('Google Drive connector not available: authentication token not found');
    }

    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-drive',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Google Drive connector error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    connectionSettings = data?.items?.[0];

    if (!connectionSettings) {
      throw new Error('Google Drive not connected: no connection found');
    }

    if (!connectionSettings.settings) {
      throw new Error('Google Drive not connected: connection settings missing');
    }

    const accessToken = connectionSettings.settings.access_token || 
                       connectionSettings.settings.oauth?.credentials?.access_token;

    if (!accessToken) {
      throw new Error('Google Drive not connected: access token not found');
    }

    return accessToken;
  } catch (error) {
    connectionSettings = null;
    throw error;
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function checkDriveConnection(): Promise<boolean> {
  try {
    const drive = await getUncachableGoogleDriveClient();
    await drive.about.get({ fields: 'user' });
    return true;
  } catch (error) {
    return false;
  }
}

export async function listFolders(parentId?: string): Promise<{ id: string; name: string; path: string }[]> {
  const drive = await getUncachableGoogleDriveClient();
  
  const query = parentId 
    ? `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    : `'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    orderBy: 'name',
  });

  return (response.data.files || []).map(file => ({
    id: file.id || '',
    name: file.name || '',
    path: file.name || '',
  }));
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
  const fs = await import('fs');
  
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
