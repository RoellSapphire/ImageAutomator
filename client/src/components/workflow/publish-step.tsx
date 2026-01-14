import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Globe, Lock, Eye, CheckCircle, AlertCircle, Loader2, ExternalLink, Play, Square, Clock, Trash2, Upload } from "lucide-react";
import { SiDeviantart } from "react-icons/si";
import type { WordPressConfig, ProcessedImage, ARMemberPlan } from "@/lib/types";

interface ScheduledUpload {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  category: string;
  isMature: boolean;
  scheduledTime: string;
  status: string;
}

interface PublishStepProps {
  images: ProcessedImage[];
  config: WordPressConfig;
  onConfigChange: (config: WordPressConfig) => void;
  armemberPlans: ARMemberPlan[];
  isVerifying: boolean;
  isVerified: boolean;
  onVerify: () => void;
}

const POST_STATUSES = [
  { value: "draft", label: "Save as Draft", icon: Eye },
  { value: "pending", label: "Pending Review", icon: AlertCircle },
  { value: "publish", label: "Publish Immediately", icon: CheckCircle },
] as const;

export function PublishStep({ 
  images, 
  config, 
  onConfigChange, 
  armemberPlans,
  isVerifying,
  isVerified,
  onVerify 
}: PublishStepProps) {
  const [localConfig, setLocalConfig] = useState<WordPressConfig>(config);
  const [showPassword, setShowPassword] = useState(false);
  
  // DeviantArt state
  const [daConnected, setDaConnected] = useState(false);
  const [daLoading, setDaLoading] = useState(false);
  const [scheduledUploads, setScheduledUploads] = useState<ScheduledUpload[]>([]);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [schedulerInterval, setSchedulerInterval] = useState(60);
  const [uploadingToDA, setUploadingToDA] = useState(false);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);
  
  // Check DeviantArt connection status
  useEffect(() => {
    checkDeviantArtStatus();
    fetchScheduledUploads();
  }, []);
  
  const checkDeviantArtStatus = async () => {
    try {
      const response = await fetch('/api/deviantart/status');
      const data = await response.json();
      setDaConnected(data.connected);
    } catch (error) {
      console.error('Failed to check DeviantArt status:', error);
    }
  };
  
  const fetchScheduledUploads = async () => {
    try {
      const response = await fetch('/api/deviantart/scheduled');
      const data = await response.json();
      setScheduledUploads(data.uploads || []);
      setSchedulerRunning(data.schedulerRunning || false);
    } catch (error) {
      console.error('Failed to fetch scheduled uploads:', error);
    }
  };
  
  const connectDeviantArt = () => {
    window.location.href = '/api/deviantart/auth';
  };
  
  const disconnectDeviantArt = async () => {
    setDaLoading(true);
    try {
      await fetch('/api/deviantart/disconnect', { method: 'POST' });
      setDaConnected(false);
    } catch (error) {
      console.error('Failed to disconnect DeviantArt:', error);
    } finally {
      setDaLoading(false);
    }
  };
  
  const uploadToDeviantArt = async (image: ProcessedImage) => {
    setUploadingToDA(true);
    try {
      const response = await fetch('/api/deviantart/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: `/api/thumbnail/${image.id}`,
          title: image.newName || image.originalName,
          description: 'Uploaded via Civitai Flow',
          category: 'digitalart/drawings',
          isMature: false,
        }),
      });
      const data = await response.json();
      if (data.success) {
        alert('Uploaded to DeviantArt successfully!');
      } else {
        alert('Upload failed: ' + (data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('DeviantArt upload error:', error);
      alert('Failed to upload to DeviantArt');
    } finally {
      setUploadingToDA(false);
    }
  };
  
  const scheduleUpload = async (image: ProcessedImage, scheduledTime: Date) => {
    try {
      const response = await fetch('/api/deviantart/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: `/api/thumbnail/${image.id}`,
          title: image.newName || image.originalName,
          description: 'Scheduled via Civitai Flow',
          category: 'digitalart/drawings',
          isMature: false,
          scheduledTime: scheduledTime.toISOString(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        fetchScheduledUploads();
      }
    } catch (error) {
      console.error('Failed to schedule upload:', error);
    }
  };
  
  const removeScheduledUpload = async (id: string) => {
    try {
      await fetch(`/api/deviantart/scheduled/${id}`, { method: 'DELETE' });
      fetchScheduledUploads();
    } catch (error) {
      console.error('Failed to remove scheduled upload:', error);
    }
  };
  
  const startScheduler = async () => {
    try {
      await fetch('/api/deviantart/scheduler/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: schedulerInterval }),
      });
      setSchedulerRunning(true);
    } catch (error) {
      console.error('Failed to start scheduler:', error);
    }
  };
  
  const stopScheduler = async () => {
    try {
      await fetch('/api/deviantart/scheduler/stop', { method: 'POST' });
      setSchedulerRunning(false);
    } catch (error) {
      console.error('Failed to stop scheduler:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Publish to WordPress</h2>
        <p className="text-muted-foreground mt-1">
          Create posts on your WordPress site with ARMember permissions
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                WordPress Connection
              </CardTitle>
              <CardDescription>
                Connect to your WordPress site
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="site-url">Site URL</Label>
                <Input
                  id="site-url"
                  type="url"
                  placeholder="https://yoursite.com"
                  value={localConfig.siteUrl}
                  onChange={(e) => setLocalConfig({ ...localConfig, siteUrl: e.target.value })}
                  data-testid="input-site-url"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">WordPress Username</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={localConfig.username}
                  onChange={(e) => setLocalConfig({ ...localConfig, username: e.target.value })}
                  data-testid="input-wp-username"
                />
                <p className="text-xs text-muted-foreground">
                  Your WordPress login username (the one you use to log into wp-admin)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-password">Application Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="app-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="xxxx xxxx xxxx xxxx xxxx"
                    value={localConfig.applicationPassword}
                    onChange={(e) => setLocalConfig({ ...localConfig, applicationPassword: e.target.value })}
                    className="flex-1 font-mono"
                    data-testid="input-app-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <Eye className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generate in WordPress: Users → Profile → Application Passwords
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="armember-api-key">ARMember API Key (Optional)</Label>
                <Input
                  id="armember-api-key"
                  type={showPassword ? "text" : "password"}
                  placeholder="vw8VKY6vuMawvaFlw8T6..."
                  value={localConfig.armemberApiKey || ""}
                  onChange={(e) => setLocalConfig({ ...localConfig, armemberApiKey: e.target.value })}
                  className="font-mono"
                  data-testid="input-armember-api-key"
                />
                <p className="text-xs text-muted-foreground">
                  Find in WordPress: ARMember → General Settings → API Settings
                </p>
              </div>

              <Button
                onClick={onVerify}
                disabled={isVerifying || !localConfig.siteUrl || !localConfig.username || !localConfig.applicationPassword}
                className="w-full"
                variant={isVerified ? "outline" : "default"}
                data-testid="button-verify-connection"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : isVerified ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Connection Verified
                  </>
                ) : (
                  "Verify Connection"
                )}
              </Button>
            </CardContent>
          </Card>

          {isVerified && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  ARMember Permissions
                </CardTitle>
                <CardDescription>
                  Set membership access level for the post
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="armember-plan">Required Membership Plan</Label>
                  <Select
                    value={localConfig.armemberPlanId || "public"}
                    onValueChange={(value) => setLocalConfig({ 
                      ...localConfig, 
                      armemberPlanId: value === "public" ? undefined : value 
                    })}
                  >
                    <SelectTrigger id="armember-plan" data-testid="select-armember-plan">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public (No Restriction)</SelectItem>
                      {armemberPlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only members with this plan can view the post
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {isVerified && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Post Details</CardTitle>
                <CardDescription>
                  Configure your WordPress post
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="post-title">Post Title</Label>
                  <Input
                    id="post-title"
                    placeholder="My Civitai Images"
                    value={localConfig.postTitle || ""}
                    onChange={(e) => setLocalConfig({ ...localConfig, postTitle: e.target.value })}
                    data-testid="input-post-title"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="post-content">Post Content</Label>
                  <Textarea
                    id="post-content"
                    placeholder="Add a description for your post..."
                    value={localConfig.postContent || ""}
                    onChange={(e) => setLocalConfig({ ...localConfig, postContent: e.target.value })}
                    rows={4}
                    data-testid="textarea-post-content"
                  />
                  <p className="text-xs text-muted-foreground">
                    Images will be added as a gallery below your content
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Post Status</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {POST_STATUSES.map((status) => {
                      const Icon = status.icon;
                      const isSelected = localConfig.postStatus === status.value;
                      return (
                        <button
                          key={status.value}
                          onClick={() => setLocalConfig({ ...localConfig, postStatus: status.value })}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                            isSelected
                              ? "bg-primary/10 border-primary"
                              : "bg-background border-input hover:bg-muted"
                          }`}
                          data-testid={`button-status-${status.value}`}
                        >
                          <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={isSelected ? "font-medium" : ""}>{status.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Publish Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Target site</span>
                  <span className="font-mono text-xs truncate max-w-[200px]">
                    {localConfig.siteUrl || "Not set"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Connection</span>
                  <Badge variant={isVerified ? "default" : "outline"}>
                    {isVerified ? "Verified" : "Not Verified"}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Images</span>
                  <Badge variant="secondary">{images.length}</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Post status</span>
                  <Badge variant="outline">
                    {POST_STATUSES.find(s => s.value === localConfig.postStatus)?.label}
                  </Badge>
                </div>
                {localConfig.armemberPlanId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Access</span>
                    <Badge variant="secondary">
                      {armemberPlans.find(p => p.id === localConfig.armemberPlanId)?.name || "Members Only"}
                    </Badge>
                  </div>
                )}
              </div>

              {isVerified && localConfig.siteUrl && (
                <Button 
                  variant="ghost" 
                  className="w-full mt-4 text-xs" 
                  asChild
                >
                  <a href={localConfig.siteUrl} target="_blank" rel="noopener noreferrer">
                    Open WordPress Admin <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <Separator className="my-8" />
      
      {/* DeviantArt Section */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <SiDeviantart className="h-6 w-6 text-[#05cc47]" />
          DeviantArt
        </h2>
        <p className="text-muted-foreground mt-1">
          Upload images to DeviantArt with scheduling support
        </p>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <SiDeviantart className="h-5 w-5 text-[#05cc47]" />
                DeviantArt Connection
              </CardTitle>
              <CardDescription>
                Connect your DeviantArt account to upload images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {daConnected ? (
                <>
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Connected to DeviantArt</span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={disconnectDeviantArt}
                    disabled={daLoading}
                    className="w-full"
                    data-testid="button-disconnect-deviantart"
                  >
                    {daLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  onClick={connectDeviantArt}
                  className="w-full bg-[#05cc47] hover:bg-[#04b33e] text-white"
                  data-testid="button-connect-deviantart"
                >
                  <SiDeviantart className="h-4 w-4 mr-2" />
                  Connect DeviantArt
                </Button>
              )}
            </CardContent>
          </Card>
          
          {daConnected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Scheduler Settings
                </CardTitle>
                <CardDescription>
                  Configure automatic posting schedule
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduler-interval">Post Interval (minutes)</Label>
                  <Input
                    id="scheduler-interval"
                    type="number"
                    min={1}
                    value={schedulerInterval}
                    onChange={(e) => setSchedulerInterval(parseInt(e.target.value) || 60)}
                    data-testid="input-scheduler-interval"
                  />
                  <p className="text-xs text-muted-foreground">
                    Time between each scheduled post
                  </p>
                </div>
                
                <div className="flex gap-2">
                  {schedulerRunning ? (
                    <Button
                      variant="destructive"
                      onClick={stopScheduler}
                      className="flex-1"
                      data-testid="button-stop-scheduler"
                    >
                      <Square className="h-4 w-4 mr-2" />
                      Stop Scheduler
                    </Button>
                  ) : (
                    <Button
                      onClick={startScheduler}
                      className="flex-1"
                      disabled={scheduledUploads.length === 0}
                      data-testid="button-start-scheduler"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Scheduler
                    </Button>
                  )}
                </div>
                
                {schedulerRunning && (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                    Scheduler is running
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        
        <div className="space-y-6">
          {daConnected && images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Quick Upload
                </CardTitle>
                <CardDescription>
                  Upload images directly or add to schedule
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                  {images.slice(0, 9).map((image) => (
                    <div 
                      key={image.id} 
                      className="relative group aspect-square rounded-md overflow-hidden border"
                    >
                      <img
                        src={`/api/thumbnail/${image.id}`}
                        alt={image.newName || image.originalName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={() => uploadToDeviantArt(image)}
                          disabled={uploadingToDA}
                          data-testid={`button-upload-da-${image.id}`}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={() => scheduleUpload(image, new Date(Date.now() + 60 * 60 * 1000))}
                          data-testid={`button-schedule-da-${image.id}`}
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {images.length > 9 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    +{images.length - 9} more images
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduled Queue
                <Badge variant="secondary">{scheduledUploads.length}</Badge>
              </CardTitle>
              <CardDescription>
                Pending uploads in the queue
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scheduledUploads.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No scheduled uploads. Add images to the queue to start.
                </p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {scheduledUploads.map((upload) => (
                    <div 
                      key={upload.id}
                      className="flex items-center gap-3 p-2 rounded-md border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{upload.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(upload.scheduledTime).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={upload.status === 'pending' ? 'outline' : 'secondary'}>
                        {upload.status}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeScheduledUpload(upload.id)}
                        data-testid={`button-remove-scheduled-${upload.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
