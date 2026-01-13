import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FolderOpen, Cloud, CheckCircle, AlertCircle, Loader2, Download } from "lucide-react";
import type { DriveConfig, ProcessedImage } from "@/lib/types";

interface ExportStepProps {
  images: ProcessedImage[];
  config: DriveConfig;
  onConfigChange: (config: DriveConfig) => void;
  isConnected: boolean;
  onConnect: () => void;
}

export function ExportStep({ images, config, onConfigChange, isConnected, onConnect }: ExportStepProps) {
  const [localConfig, setLocalConfig] = useState<DriveConfig>(config);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  const handleConnect = async () => {
    setIsConnecting(true);
    await onConnect();
    setIsConnecting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Export to Google Drive</h2>
        <p className="text-muted-foreground mt-1">
          Save your processed images to Google Drive
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Google Drive Connection
            </CardTitle>
            <CardDescription>
              Connect your Google Drive account
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
                      ? "Ready to export files" 
                      : "Connect to enable export"}
                  </p>
                </div>
              </div>
              <Button
                variant={isConnected ? "outline" : "default"}
                onClick={handleConnect}
                disabled={isConnecting}
                data-testid="button-connect-drive"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : isConnected ? (
                  "Reconnect"
                ) : (
                  "Connect Drive"
                )}
              </Button>
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
                        onChange={(e) => setLocalConfig({ ...localConfig, folderPath: e.target.value })}
                        className="flex-1"
                        data-testid="input-folder-path"
                      />
                      <Button variant="outline" size="icon" data-testid="button-browse-folder">
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the path where images will be saved
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
                Download processed images directly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                You can also download all processed images as a ZIP file without connecting to Google Drive.
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                disabled={images.length === 0}
                data-testid="button-download-zip"
              >
                <Download className="h-4 w-4 mr-2" />
                Download as ZIP
              </Button>
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
    </div>
  );
}
