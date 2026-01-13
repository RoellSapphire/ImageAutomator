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
import { FolderOpen, Cloud, CheckCircle, AlertCircle, Loader2, Download, ChevronRight, Home, ArrowLeft } from "lucide-react";
import type { DriveConfig, ProcessedImage } from "@/lib/types";

interface DriveFolder {
  id: string;
  name: string;
  path: string;
}

interface ExportStepProps {
  images: ProcessedImage[];
  config: DriveConfig;
  onConfigChange: (config: DriveConfig) => void;
  isConnected: boolean;
  onConnect: () => void;
  workflowId: string | null;
}

export function ExportStep({ images, config, onConfigChange, isConnected, onConnect, workflowId }: ExportStepProps) {
  const [localConfig, setLocalConfig] = useState<DriveConfig>(config);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  const handleConnect = async () => {
    setIsConnecting(true);
    await onConnect();
    setIsConnecting(false);
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Google Drive Connection
            </CardTitle>
            <CardDescription>
              Your Google Drive is connected via Replit
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
                    {isConnected ? "Connected" : "Checking..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected 
                      ? "Ready to export files" 
                      : "Checking connection status"}
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
                    Checking...
                  </>
                ) : isConnected ? (
                  "Refresh"
                ) : (
                  "Check Connection"
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
    </div>
  );
}
