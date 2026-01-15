import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FolderOpen, Cloud, CheckCircle, AlertCircle, Loader2, Download, ChevronRight, Home, ArrowLeft, Ban, MessageCircle, Send, Hash, Plus, Trash2, Settings } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import type { DriveConfig, ProcessedImage } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface DriveFolder {
  id: string;
  name: string;
  path: string;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

interface DiscordWebhook {
  id: string;
  name: string;
  webhookUrl: string;
  defaultMessage?: string;
}

interface ExportStepProps {
  images: ProcessedImage[];
  config: DriveConfig;
  onConfigChange: (config: DriveConfig) => void;
  isConnected: boolean;
  connectedEmail?: string;
  onRefreshStatus: () => void;
  onDisconnect: () => void;
  workflowId: string | null;
  skipExport?: boolean;
  onSkipExportChange?: (skip: boolean) => void;
}

export function ExportStep({ images, config, onConfigChange, isConnected, connectedEmail, onRefreshStatus, onDisconnect, workflowId, skipExport = false, onSkipExportChange }: ExportStepProps) {
  const { toast } = useToast();
  const [localConfig, setLocalConfig] = useState<DriveConfig>(config);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);
  
  // Discord state
  const [discordConnected, setDiscordConnected] = useState(false);
  const [discordUsername, setDiscordUsername] = useState<string | null>(null);
  const [discordLoading, setDiscordLoading] = useState(true);
  const [discordGuilds, setDiscordGuilds] = useState<DiscordGuild[]>([]);
  const [discordChannels, setDiscordChannels] = useState<DiscordChannel[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [discordMessage, setDiscordMessage] = useState('');
  const [postingToDiscord, setPostingToDiscord] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [discordMode, setDiscordMode] = useState<'oauth' | 'webhook'>('webhook');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [savedWebhooks, setSavedWebhooks] = useState<DiscordWebhook[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>('');
  const [showWebhookManager, setShowWebhookManager] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  // Check Discord connection status and load webhooks on mount
  useEffect(() => {
    const checkDiscordStatus = async () => {
      try {
        const response = await fetch('/api/discord/status');
        const data = await response.json();
        setDiscordConnected(data.connected);
        setDiscordUsername(data.username || null);
        if (data.connected) {
          loadDiscordGuilds();
        }
      } catch (error) {
        console.error('Failed to check Discord status:', error);
        setDiscordConnected(false);
      } finally {
        setDiscordLoading(false);
      }
    };
    checkDiscordStatus();
    loadSavedWebhooks();
  }, []);

  const loadSavedWebhooks = async () => {
    try {
      setLoadingWebhooks(true);
      const response = await fetch('/api/discord/webhooks');
      const data = await response.json();
      setSavedWebhooks(data || []);
    } catch (error) {
      console.error('Failed to load webhooks:', error);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const handleAddWebhook = async () => {
    if (!newWebhookName || !newWebhookUrl) {
      toast({ title: "Error", description: "Name and URL are required", variant: "destructive" });
      return;
    }
    
    try {
      const response = await fetch('/api/discord/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWebhookName, webhookUrl: newWebhookUrl })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to add webhook');
      }
      
      const newWebhook = await response.json();
      setSavedWebhooks([...savedWebhooks, newWebhook]);
      setNewWebhookName('');
      setNewWebhookUrl('');
      toast({ title: "Webhook Added", description: `Added ${newWebhook.name}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      const response = await fetch(`/api/discord/webhooks/${id}`, { method: 'DELETE' });
      
      if (!response.ok) {
        throw new Error('Failed to delete webhook');
      }
      
      setSavedWebhooks(savedWebhooks.filter(w => w.id !== id));
      if (selectedWebhookId === id) {
        setSelectedWebhookId('');
        setWebhookUrl('');
      }
      toast({ title: "Webhook Deleted" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSelectWebhook = (webhookId: string) => {
    setSelectedWebhookId(webhookId);
    const webhook = savedWebhooks.find(w => w.id === webhookId);
    if (webhook) {
      setWebhookUrl(webhook.webhookUrl);
      if (webhook.defaultMessage) {
        setDiscordMessage(webhook.defaultMessage);
      }
    }
  };

  // Load channels when guild changes
  useEffect(() => {
    if (selectedGuildId) {
      loadDiscordChannels(selectedGuildId);
    } else {
      setDiscordChannels([]);
      setSelectedChannelId('');
    }
  }, [selectedGuildId]);

  const loadDiscordGuilds = async () => {
    try {
      const response = await fetch('/api/discord/guilds');
      const data = await response.json();
      setDiscordGuilds(data.guilds || []);
    } catch (error) {
      console.error('Failed to load Discord guilds:', error);
    }
  };

  const [channelError, setChannelError] = useState<string | null>(null);
  
  const loadDiscordChannels = async (guildId: string) => {
    setLoadingChannels(true);
    setChannelError(null);
    try {
      const response = await fetch(`/api/discord/channels/${guildId}`);
      const data = await response.json();
      if (!response.ok) {
        setChannelError(data.message || 'Failed to load channels');
        setDiscordChannels([]);
      } else {
        setDiscordChannels(data.channels || []);
        if ((data.channels || []).length === 0) {
          setChannelError('No text channels found or missing permissions');
        }
      }
    } catch (error: any) {
      console.error('Failed to load Discord channels:', error);
      setChannelError(error.message || 'Failed to load channels');
    } finally {
      setLoadingChannels(false);
    }
  };

  const handlePostToDiscord = async () => {
    if (!workflowId) return;
    
    if (discordMode === 'oauth' && !selectedChannelId) return;
    if (discordMode === 'webhook' && !webhookUrl) return;
    
    setPostingToDiscord(true);
    try {
      const endpoint = discordMode === 'webhook' ? '/api/discord/webhook' : '/api/discord/post';
      const body = discordMode === 'webhook' 
        ? { webhookUrl, message: discordMessage, workflowId }
        : { channelId: selectedChannelId, message: discordMessage, workflowId };
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Posted to Discord",
          description: `Successfully posted ${data.count} images to Discord`
        });
        setDiscordMessage('');
      } else {
        toast({
          title: "Discord Error",
          description: data.message || "Failed to post to Discord",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Discord Error",
        description: error.message || "Failed to post to Discord",
        variant: "destructive"
      });
    } finally {
      setPostingToDiscord(false);
    }
  };

  const handleConnectDrive = () => {
    const authWindow = window.open('/api/drive/oauth/start', '_blank');
    
    const checkInterval = setInterval(() => {
      if (authWindow?.closed) {
        clearInterval(checkInterval);
        onRefreshStatus();
      }
    }, 1000);
    
    setTimeout(() => clearInterval(checkInterval), 300000);
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    await onDisconnect();
    setIsDisconnecting(false);
  };

  const handleDownloadZip = () => {
    if (!workflowId) return;
    window.open(`/api/download/${workflowId}`, '_blank');
  };

  const loadFolders = async (parentId?: string) => {
    setLoadingFolders(true);
    try {
      const url = parentId ? `/api/drive/folders?parentId=${parentId}` : '/api/drive/folders';
      const response = await fetch(url);
      const data = await response.json();
      setFolders(data.folders || []);
    } catch (error) {
      console.error('Failed to load folders:', error);
      setFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  const openFolderBrowser = () => {
    setShowFolderBrowser(true);
    setFolderPath([]);
    setSelectedFolder(null);
    loadFolders();
  };

  const navigateToFolder = (folder: DriveFolder) => {
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
    setSelectedFolder(null);
    loadFolders(folder.id);
  };

  const navigateBack = () => {
    const newPath = folderPath.slice(0, -1);
    setFolderPath(newPath);
    setSelectedFolder(null);
    loadFolders(newPath.length > 0 ? newPath[newPath.length - 1].id : undefined);
  };

  const navigateToRoot = () => {
    setFolderPath([]);
    setSelectedFolder(null);
    loadFolders();
  };

  const selectFolder = () => {
    if (selectedFolder) {
      setLocalConfig({ ...localConfig, folderId: selectedFolder.id, folderPath: '/' + [...folderPath.map(f => f.name), selectedFolder.name].join('/') });
    } else if (folderPath.length > 0) {
      const currentFolder = folderPath[folderPath.length - 1];
      setLocalConfig({ ...localConfig, folderId: currentFolder.id, folderPath: '/' + folderPath.map(f => f.name).join('/') });
    } else {
      setLocalConfig({ ...localConfig, folderId: undefined, folderPath: '/' });
    }
    setShowFolderBrowser(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Export to Google Drive</h2>
        <p className="text-muted-foreground mt-1">
          Save your processed images to Google Drive or download to your computer
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skip-export" className="flex items-center gap-2">
                <Ban className="h-4 w-4" />
                Skip Export
              </Label>
              <p className="text-xs text-muted-foreground">
                Skip uploading to Google Drive
              </p>
            </div>
            <Switch
              id="skip-export"
              checked={skipExport}
              onCheckedChange={(checked) => onSkipExportChange?.(checked)}
              data-testid="switch-skip-export"
            />
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-6 lg:grid-cols-2 ${skipExport ? 'opacity-50 pointer-events-none' : ''}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Google Drive Connection
            </CardTitle>
            <CardDescription>
              {isConnected ? `Connected as ${connectedEmail}` : "Connect your Google Drive to export files"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${isConnected ? 'bg-green-500/10' : 'bg-muted'}`}>
                  {isConnected ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">
                    {isConnected ? "Connected" : "Not Connected"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected 
                      ? connectedEmail || "Ready to export files"
                      : "Click to connect your Google account"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {isConnected ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRefreshStatus}
                      data-testid="button-refresh-drive"
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                      data-testid="button-disconnect-drive"
                    >
                      {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleConnectDrive}
                    data-testid="button-connect-drive"
                  >
                    Connect Google Drive
                  </Button>
                )}
              </div>
            </div>

            {isConnected && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="folder-path">Destination Folder</Label>
                    <div className="flex gap-2">
                      <Input
                        id="folder-path"
                        placeholder="/Civitai Images"
                        value={localConfig.folderPath || ""}
                        onChange={(e) => setLocalConfig({ ...localConfig, folderPath: e.target.value, folderId: undefined })}
                        className="flex-1"
                        data-testid="input-folder-path"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={openFolderBrowser}
                        data-testid="button-browse-folder"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the path or browse to select a folder
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="subfolder-toggle">Create Subfolder</Label>
                      <p className="text-xs text-muted-foreground">
                        Organize by date or custom name
                      </p>
                    </div>
                    <Switch
                      id="subfolder-toggle"
                      checked={localConfig.createSubfolder}
                      onCheckedChange={(checked) => setLocalConfig({ ...localConfig, createSubfolder: checked })}
                      data-testid="switch-subfolder"
                    />
                  </div>

                  {localConfig.createSubfolder && (
                    <div className="space-y-2">
                      <Label htmlFor="subfolder-name">Subfolder Name</Label>
                      <Input
                        id="subfolder-name"
                        placeholder="e.g., 2026-01-13 or Project Name"
                        value={localConfig.subfolderName || ""}
                        onChange={(e) => setLocalConfig({ ...localConfig, subfolderName: e.target.value })}
                        data-testid="input-subfolder-name"
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="h-5 w-5" />
                Local Download
              </CardTitle>
              <CardDescription>
                Download processed images to your computer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Download all processed images as a ZIP file to save on your computer.
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                disabled={images.length === 0 || !workflowId}
                onClick={handleDownloadZip}
                data-testid="button-download-zip"
              >
                <Download className="h-4 w-4 mr-2" />
                Download to Computer
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SiDiscord className="h-5 w-5" />
                Post to Discord
              </CardTitle>
              <CardDescription>
                Share your images to a Discord channel
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={discordMode === 'webhook' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDiscordMode('webhook')}
                  data-testid="button-discord-webhook-mode"
                >
                  Webhook (Recommended)
                </Button>
                <Button
                  variant={discordMode === 'oauth' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDiscordMode('oauth')}
                  data-testid="button-discord-oauth-mode"
                >
                  OAuth (Beta)
                </Button>
              </div>
              
              {discordMode === 'webhook' ? (
                <div className="space-y-4">
                  {/* Saved Webhooks Selector */}
                  {savedWebhooks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Saved Webhooks</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowWebhookManager(true)}
                          data-testid="button-manage-webhooks"
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                      </div>
                      <Select value={selectedWebhookId} onValueChange={handleSelectWebhook}>
                        <SelectTrigger data-testid="select-saved-webhook">
                          <SelectValue placeholder="Select a saved webhook" />
                        </SelectTrigger>
                        <SelectContent>
                          {savedWebhooks.map(webhook => (
                            <SelectItem key={webhook.id} value={webhook.id}>
                              {webhook.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {savedWebhooks.length === 0 && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">No saved webhooks</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowWebhookManager(true)}
                        data-testid="button-add-first-webhook"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Webhook
                      </Button>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <Input
                      placeholder="https://discord.com/api/webhooks/..."
                      value={webhookUrl}
                      onChange={(e) => {
                        setWebhookUrl(e.target.value);
                        setSelectedWebhookId(''); // Clear selection when typing custom
                      }}
                      data-testid="input-webhook-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Select a saved webhook above, or paste a URL here
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Message (optional)</Label>
                    <Textarea
                      placeholder="Add a message to accompany your images..."
                      value={discordMessage}
                      onChange={(e) => setDiscordMessage(e.target.value)}
                      rows={2}
                      data-testid="textarea-discord-message"
                    />
                  </div>
                  
                  <Button
                    className="w-full"
                    onClick={handlePostToDiscord}
                    disabled={postingToDiscord || images.length === 0 || !webhookUrl}
                    data-testid="button-post-discord"
                  >
                    {postingToDiscord ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Post {images.length} Images to Discord
                  </Button>
                  
                  {images.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Will post in {Math.ceil(images.length / 10)} messages (Discord 10 image limit)
                    </p>
                  )}
                </div>
              ) : discordLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !discordConnected ? (
                <div className="text-center p-4">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Discord not connected</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Connect Discord in the Replit integrations to post images
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setDiscordLoading(true);
                      try {
                        const response = await fetch('/api/discord/status');
                        const data = await response.json();
                        setDiscordConnected(data.connected);
                        setDiscordUsername(data.username || null);
                        if (data.connected) {
                          loadDiscordGuilds();
                        }
                      } catch (error) {
                        console.error('Failed to check Discord status:', error);
                      } finally {
                        setDiscordLoading(false);
                      }
                    }}
                    data-testid="button-refresh-discord"
                  >
                    Refresh Connection
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Connected as {discordUsername}
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Server</Label>
                    <Select value={selectedGuildId} onValueChange={setSelectedGuildId}>
                      <SelectTrigger data-testid="select-discord-server">
                        <SelectValue placeholder="Select a server" />
                      </SelectTrigger>
                      <SelectContent>
                        {discordGuilds.map(guild => (
                          <SelectItem key={guild.id} value={guild.id}>
                            {guild.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {selectedGuildId && (
                    <div className="space-y-2">
                      <Label>Channel</Label>
                      {loadingChannels ? (
                        <div className="flex items-center gap-2 p-2 border rounded-md">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm text-muted-foreground">Loading channels...</span>
                        </div>
                      ) : channelError ? (
                        <div className="p-3 border rounded-md bg-destructive/10">
                          <p className="text-sm text-destructive">{channelError}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            OAuth may lack permissions. Use Webhook mode instead.
                          </p>
                        </div>
                      ) : discordChannels.length > 0 ? (
                        <Select 
                          value={selectedChannelId} 
                          onValueChange={setSelectedChannelId}
                        >
                          <SelectTrigger data-testid="select-discord-channel">
                            <SelectValue placeholder="Select a channel" />
                          </SelectTrigger>
                          <SelectContent>
                            {discordChannels.map(channel => (
                              <SelectItem key={channel.id} value={channel.id}>
                                <span className="flex items-center gap-1">
                                  <Hash className="h-3 w-3" />
                                  {channel.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  )}
                  
                  {selectedChannelId && (
                    <>
                      <div className="space-y-2">
                        <Label>Message (optional)</Label>
                        <Textarea
                          placeholder="Add a message to accompany your images..."
                          value={discordMessage}
                          onChange={(e) => setDiscordMessage(e.target.value)}
                          rows={2}
                          data-testid="textarea-discord-message-oauth"
                        />
                      </div>
                      
                      <Button
                        className="w-full"
                        onClick={handlePostToDiscord}
                        disabled={postingToDiscord || images.length === 0}
                        data-testid="button-post-discord-oauth"
                      >
                        {postingToDiscord ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Post {images.length} Images to Discord
                      </Button>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Files to export</span>
                  <Badge variant="secondary">{images.length} images</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Google Drive</span>
                  <Badge variant={isConnected ? "default" : "outline"}>
                    {isConnected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discord</span>
                  <Badge variant={discordConnected ? "default" : "outline"}>
                    {discordConnected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
                {isConnected && localConfig.folderPath && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Destination</span>
                    <span className="font-mono text-xs">
                      {localConfig.folderPath}
                      {localConfig.createSubfolder && localConfig.subfolderName 
                        ? `/${localConfig.subfolderName}` 
                        : ""}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showFolderBrowser} onOpenChange={setShowFolderBrowser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Google Drive Folder</DialogTitle>
          </DialogHeader>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground border-b pb-2">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={navigateToRoot}>
              <Home className="h-4 w-4" />
            </Button>
            {folderPath.length > 0 && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={navigateBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="truncate">
              / {folderPath.map(f => f.name).join(' / ')}
            </span>
          </div>

          <ScrollArea className="h-[300px]">
            {loadingFolders ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : folders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FolderOpen className="h-8 w-8 mb-2" />
                <p className="text-sm">No folders found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover-elevate ${
                      selectedFolder?.id === folder.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedFolder(selectedFolder?.id === folder.id ? null : folder)}
                    onDoubleClick={() => navigateToFolder(folder)}
                    data-testid={`folder-${folder.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{folder.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToFolder(folder);
                      }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderBrowser(false)}>
              Cancel
            </Button>
            <Button onClick={selectFolder} data-testid="button-select-folder">
              {selectedFolder ? `Select "${selectedFolder.name}"` : folderPath.length > 0 ? `Use "${folderPath[folderPath.length - 1].name}"` : "Use Root"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWebhookManager} onOpenChange={setShowWebhookManager}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Discord Webhooks</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add new webhook form */}
            <div className="space-y-3 p-3 border rounded-md">
              <Label className="text-sm font-medium">Add New Webhook</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Channel name"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  data-testid="input-new-webhook-name"
                />
                <Input
                  placeholder="Webhook URL"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  data-testid="input-new-webhook-url"
                />
              </div>
              <Button 
                size="sm" 
                onClick={handleAddWebhook}
                disabled={!newWebhookName || !newWebhookUrl}
                data-testid="button-save-webhook"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Webhook
              </Button>
            </div>
            
            <Separator />
            
            {/* Saved webhooks list */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Saved Webhooks ({savedWebhooks.length})</Label>
              {loadingWebhooks ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : savedWebhooks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center p-4">
                  No webhooks saved yet
                </p>
              ) : (
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {savedWebhooks.map(webhook => (
                      <div 
                        key={webhook.id} 
                        className="flex items-center justify-between p-2 border rounded-md"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{webhook.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {webhook.webhookUrl.substring(0, 50)}...
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteWebhook(webhook.id)}
                          data-testid={`button-delete-webhook-${webhook.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWebhookManager(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
