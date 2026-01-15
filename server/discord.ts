// Discord Integration - Replit Connector
import { Client, GatewayIntentBits, TextChannel, AttachmentBuilder } from 'discord.js';

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

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Discord not connected');
  }
  return accessToken;
}

async function getUncachableDiscordClient(): Promise<Client> {
  const token = await getAccessToken();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });

  await client.login(token);
  return client;
}

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
    const client = await getUncachableDiscordClient();
    const username = client.user?.username || 'Unknown';
    await client.destroy();
    return { connected: true, username };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}

export async function getDiscordGuilds(): Promise<DiscordGuild[]> {
  const client = await getUncachableDiscordClient();
  
  try {
    const guilds = client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL()
    }));
    
    return guilds;
  } finally {
    await client.destroy();
  }
}

export async function getDiscordChannels(guildId: string): Promise<DiscordChannel[]> {
  const client = await getUncachableDiscordClient();
  
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error('Guild not found');
    }
    
    const channels = guild.channels.cache
      .filter(channel => channel.type === 0)
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type
      }));
    
    return channels;
  } finally {
    await client.destroy();
  }
}

export async function postToDiscord(
  channelId: string,
  message: string,
  imageBuffers: { buffer: Buffer; filename: string }[]
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const client = await getUncachableDiscordClient();
  
  try {
    const channel = await client.channels.fetch(channelId);
    
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error('Channel not found or not a text channel');
    }
    
    const attachments = imageBuffers.map(img => 
      new AttachmentBuilder(img.buffer, { name: img.filename })
    );
    
    const sentMessage = await channel.send({
      content: message || undefined,
      files: attachments
    });
    
    return { success: true, messageId: sentMessage.id };
  } catch (error: any) {
    console.error('Discord post error:', error);
    return { success: false, error: error.message };
  } finally {
    await client.destroy();
  }
}
