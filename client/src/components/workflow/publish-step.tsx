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
import { Globe, Lock, Eye, CheckCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WordPressConfig, ProcessedImage, ARMemberPlan } from "@/lib/types";

interface PublishStepProps {
  images: ProcessedImage[];
  config: WordPressConfig;
  onConfigChange: (config: WordPressConfig) => void;
  armemberPlans: ARMemberPlan[];
  isVerifying: boolean;
  isVerified: boolean;
  onVerify: () => void;
  publishedPostUrl?: string | null;
  onClearPublishedUrl?: () => void;
  skipWordpress: boolean;
  onSkipWordpressChange: (skip: boolean) => void;
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
  onVerify,
  publishedPostUrl,
  onClearPublishedUrl,
  skipWordpress,
  onSkipWordpressChange,
}: PublishStepProps) {
  const { toast } = useToast();
  const [localConfig, setLocalConfig] = useState<WordPressConfig>(config);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Publish to WordPress</h2>
          <p className="text-muted-foreground mt-1">
            Create posts on your WordPress site with ARMember permissions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="skip-wordpress" className="text-sm">Skip WordPress</Label>
          </div>
          <Switch
            id="skip-wordpress"
            checked={skipWordpress}
            onCheckedChange={onSkipWordpressChange}
            data-testid="switch-skip-wordpress"
          />
        </div>
      </div>

      <div className={skipWordpress ? "opacity-50 pointer-events-none" : ""}>
      {publishedPostUrl && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle className="h-5 w-5" />
              Post Published Successfully
            </CardTitle>
            <CardDescription className="text-green-600 dark:text-green-400">
              Your post has been created on WordPress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Button
                variant="default"
                onClick={() => window.open(publishedPostUrl, '_blank')}
                data-testid="button-view-post"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Published Post
              </Button>
              <Button
                variant="outline"
                onClick={onClearPublishedUrl}
                data-testid="button-dismiss-review"
              >
                Dismiss
              </Button>
            </div>
            <p className="text-sm text-muted-foreground break-all">
              {publishedPostUrl}
            </p>
          </CardContent>
        </Card>
      )}

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

      </div>
    </div>
  );
}
