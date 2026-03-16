// Discord Integration - Using REST API with OAuth tokens from Replit Connector
import FormData from 'form-data';

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=discord',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Discord not connected');
  }
  return accessToken;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export async function checkDiscordConnection(): Promise<{ connected: boolean; username?: string; error?: string }> {
  try {
    // When running outside Replit, Discord OAuth won't work.
    // Webhooks still work independently - show as connected if webhooks are configured.
    const token = await getAccessToken();

    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Discord user check failed:', response.status, text);
      return { connected: false, error: `Failed to get user: ${response.status}` };
    }

    const user = await response.json();
    return { connected: true, username: user.username };
  } catch (error: any) {
    // Outside Replit: OAuth doesn't work, but webhooks do.
    // Return a soft status indicating webhooks-only mode.
    if (error.message?.includes('X_REPLIT_TOKEN')) {
      return { connected: false, error: 'Running locally - use Discord webhooks for posting' };
    }
    console.error('Discord connection check error:', error);
    return { connected: false, error: error.message };
  }
}

export async function getDiscordGuilds(): Promise<DiscordGuild[]> {
  const token = await getAccessToken();
  
  const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error('Discord guilds fetch failed:', response.status, text);
    throw new Error(`Failed to fetch guilds: ${response.status}`);
  }
  
  const guilds = await response.json();
  return guilds.map((guild: any) => ({
    id: guild.id,
    name: guild.name,
    icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null
  }));
}

export async function getDiscordChannels(guildId: string): Promise<DiscordChannel[]> {
  const token = await getAccessToken();
  
  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/channels`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error('Discord channels fetch failed:', response.status, text);
    throw new Error(`Failed to fetch channels: ${response.status}`);
  }
  
  const channels = await response.json();
  return channels
    .filter((channel: any) => channel.type === 0)
    .map((channel: any) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type
    }));
}

export async function postToDiscord(
  channelId: string,
  message: string,
  imageBuffers: { buffer: Buffer; filename: string }[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = await getAccessToken();
  
  try {
    const formData = new FormData();
    
    // Build attachments metadata for multipart
    const attachments = imageBuffers.map((img, index) => ({
      id: index,
      filename: img.filename
    }));
    
    const payload: any = {
      attachments: attachments
    };
    if (message) {
      payload.content = message;
    }
    
    formData.append('payload_json', JSON.stringify(payload));
    
    imageBuffers.forEach((img, index) => {
      formData.append(`files[${index}]`, img.buffer, {
        filename: img.filename,
        contentType: 'image/png'
      });
    });
    
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      body: formData.getBuffer()
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Discord post failed:', response.status, text);
      
      if (response.status === 403) {
        return { success: false, error: 'Missing permissions to post messages. Try using a webhook URL instead.' };
      }
      if (response.status === 401) {
        return { success: false, error: 'OAuth token expired or invalid. Try using a webhook URL instead.' };
      }
      
      return { success: false, error: `Failed to post: ${response.status} - ${text}` };
    }
    
    const result = await response.json();
    return { success: true, messageId: result.id };
  } catch (error: any) {
    console.error('Discord post error:', error);
    return { success: false, error: error.message };
  }
}

export async function postToWebhook(
  webhookUrl: string,
  message: string,
  imageBuffers: { buffer: Buffer; filename: string }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!webhookUrl.includes('discord.com/api/webhooks/')) {
      return { success: false, error: 'Invalid Discord webhook URL' };
    }
    
    const formData = new FormData();
    
    // Build attachments metadata for multipart
    const attachments = imageBuffers.map((img, index) => ({
      id: index,
      filename: img.filename
    }));
    
    const payload: any = {
      attachments: attachments
    };
    if (message) {
      payload.content = message;
    }
    
    formData.append('payload_json', JSON.stringify(payload));
    
    imageBuffers.forEach((img, index) => {
      formData.append(`files[${index}]`, img.buffer, {
        filename: img.filename,
        contentType: 'image/png'
      });
    });
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: formData.getHeaders(),
      body: formData.getBuffer()
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Discord webhook post failed:', response.status, text);
      return { success: false, error: `Failed to post: ${response.status}` };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Discord webhook error:', error);
    return { success: false, error: error.message };
  }
}
