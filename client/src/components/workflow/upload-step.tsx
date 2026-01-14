import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileArchive, Images, CheckCircle, AlertCircle, Loader2, Zap, FileEdit, ImageIcon, FolderOpen, Globe, Settings, Home, ArrowLeft, ChevronRight, Download, RefreshCw, Check, Sparkles, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DriveFolder {
  id: string;
  name: string;
  path: string;
}
import type { ProcessedImage, AutoModeSettings, DescriptionTemplate, RenameConfig, EnhanceConfig, DriveConfig, WordPressConfig, ARMemberPlan } from "@/lib/types";

interface CivitaiImageData {
  id: string;
  url: string;
  width: number;
  height: number;
  createdAt: string;
  meta: { prompt?: string; Model?: string } | null;
}

interface UploadStepProps {
  onUploadComplete: (images: ProcessedImage[], workflowId: string) => void;
  uploadedImages: ProcessedImage[];
  workflowId: string | null;
  autoModeSettings: AutoModeSettings;
  onAutoModeChange: (settings: AutoModeSettings) => void;
  descriptionTemplates: DescriptionTemplate[];
  isAutoRunning?: boolean;
  hasWordPressConfig?: boolean;
  hasDriveConfig?: boolean;
  onConnectDrive?: () => Promise<void>;
  isConnectingDrive?: boolean;
  renameConfig?: RenameConfig;
  onRenameConfigChange?: (config: RenameConfig) => void;
  enhanceConfig?: EnhanceConfig;
  onEnhanceConfigChange?: (config: EnhanceConfig) => void;
  driveConfig?: DriveConfig;
  onDriveConfigChange?: (config: DriveConfig) => void;
  wordpressConfig?: WordPressConfig;
  onWordpressConfigChange?: (config: WordPressConfig) => void;
  armemberPlans?: ARMemberPlan[];
}

export function UploadStep({ 
  onUploadComplete, 
  uploadedImages, 
  workflowId,
  autoModeSettings,
  onAutoModeChange,
  descriptionTemplates,
  isAutoRunning = false,
  hasWordPressConfig = false,
  hasDriveConfig = false,
  onConnectDrive,
  isConnectingDrive = false,
  renameConfig,
  onRenameConfigChange,
  enhanceConfig,
  onEnhanceConfigChange,
  driveConfig,
  onDriveConfigChange,
  wordpressConfig,
  onWordpressConfigChange,
  armemberPlans = []
}: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<"zip" | "images" | "civitai">("zip");
  const imagesInputRef = useRef<HTMLInputElement>(null);
  
  // Civitai state
  const [civitaiStatus, setCivitaiStatus] = useState<{ connected: boolean; username?: string } | null>(null);
  const [civitaiImages, setCivitaiImages] = useState<CivitaiImageData[]>([]);
  const [civitaiLoading, setCivitaiLoading] = useState(false);
  const [civitaiNextCursor, setCivitaiNextCursor] = useState<string | undefined>();
  const [civitaiPendingImages, setCivitaiPendingImages] = useState<CivitaiImageData[]>([]);
  const [selectedCivitaiImages, setSelectedCivitaiImages] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [deleteAfterImport, setDeleteAfterImport] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState<number | null>(null);
  
  // Folder browser state
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolder | null>(null);

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

  // Civitai functions
  const checkCivitaiStatus = async () => {
    try {
      const response = await fetch('/api/civitai/status');
      const data = await response.json();
      setCivitaiStatus(data);
      return data.connected;
    } catch (error) {
      console.error('Failed to check Civitai status:', error);
      setCivitaiStatus({ connected: false });
      return false;
    }
  };

  const loadCivitaiImages = async (reset = false, targetCount?: number) => {
    if (civitaiLoading) return;
    
    setCivitaiLoading(true);
    setError(null);
    if (targetCount) setLoadingTarget(targetCount);
    
    try {
      // Fetch all available images first (up to a reasonable limit), then take what we need
      // This ensures we always get the newest images regardless of API pagination order
      const allFetchedImages: CivitaiImageData[] = [];
      let cursor: string | undefined = undefined;
      const maxFetch = Math.max(targetCount || 50, 200); // Fetch at least 200 to have a good pool
      
      // Always fetch fresh from the beginning to get newest images
      while (allFetchedImages.length < maxFetch) {
        const fetchUrl: string = cursor 
          ? `/api/civitai/images?cursor=${cursor}&limit=50`
          : '/api/civitai/images?limit=50';
        
        const fetchResponse: Response = await fetch(fetchUrl);
        if (!fetchResponse.ok) {
          const errorData = await fetchResponse.json();
          throw new Error(errorData.message || 'Failed to load images');
        }
        
        const responseData = await fetchResponse.json();
        const newImages = responseData.images as CivitaiImageData[];
        
        if (newImages.length === 0) break;
        
        allFetchedImages.push(...newImages);
        cursor = responseData.metadata.nextCursor;
        
        // If no more pages, break
        if (!cursor) break;
      }
      
      // Sort all fetched images by createdAt descending (newest first)
      allFetchedImages.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      // Take only the target count from the sorted list
      const target = targetCount || 50;
      const resultImages = allFetchedImages.slice(0, target);
      const pendingBuffer = allFetchedImages.slice(target);
      
      // Update state
      setCivitaiImages(resultImages);
      setCivitaiNextCursor(cursor);
      setCivitaiPendingImages(pendingBuffer);
      
    } catch (error: any) {
      setError(error.message || 'Failed to load Civitai images');
    } finally {
      setCivitaiLoading(false);
      setLoadingTarget(null);
    }
  };

  const toggleCivitaiImage = (id: string) => {
    setSelectedCivitaiImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllCivitaiImages = () => {
    if (selectedCivitaiImages.size === civitaiImages.length) {
      setSelectedCivitaiImages(new Set());
    } else {
      setSelectedCivitaiImages(new Set(civitaiImages.map(img => img.id)));
    }
  };

  const importCivitaiImages = async () => {
    if (selectedCivitaiImages.size === 0) return;
    
    setIsImporting(true);
    setError(null);
    
    try {
      // Get the selected image data to send URLs
      const selectedImagesData = civitaiImages
        .filter(img => selectedCivitaiImages.has(img.id))
        .map(img => ({ id: img.id, url: img.url, width: img.width, height: img.height }));
      
      const response = await fetch('/api/civitai/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          imageUrls: selectedImagesData,
          deleteAfterImport 
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to import images');
      }
      
      const data = await response.json();
      setFileName(`${data.imported} Civitai images`);
      
      // Remove imported images from the local list if delete was enabled
      if (deleteAfterImport) {
        setCivitaiImages(prev => prev.filter(img => !selectedCivitaiImages.has(img.id)));
      }
      
      setSelectedCivitaiImages(new Set());
      onUploadComplete(data.images, data.workflowId);
    } catch (error: any) {
      setError(error.message || 'Failed to import Civitai images');
    } finally {
      setIsImporting(false);
    }
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

  const selectFolderFromBrowser = () => {
    if (!driveConfig || !onDriveConfigChange) return;
    
    if (selectedFolder) {
      onDriveConfigChange({ 
        ...driveConfig, 
        folderId: selectedFolder.id, 
        folderPath: '/' + [...folderPath.map(f => f.name), selectedFolder.name].join('/') 
      });
    } else if (folderPath.length > 0) {
      const currentFolder = folderPath[folderPath.length - 1];
      onDriveConfigChange({ 
        ...driveConfig, 
        folderId: currentFolder.id, 
        folderPath: '/' + folderPath.map(f => f.name).join('/') 
      });
    } else {
      onDriveConfigChange({ ...driveConfig, folderId: undefined, folderPath: '/' });
    }
    setShowFolderBrowser(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleZipFile(files[0]);
    }
  }, []);

  const handleImagesInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageFiles(Array.from(files));
    }
  }, []);

  const handleZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError("Please upload a ZIP file");
      return;
    }

    setFileName(file.name);
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setIsUploading(false);
          setUploadProgress(100);
          onUploadComplete(response.images, response.workflowId);
        } else {
          setError("Upload failed. Please try again.");
          setIsUploading(false);
        }
      };

      xhr.onerror = () => {
        setError("Network error. Please try again.");
        setIsUploading(false);
      };

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (err) {
      setError("Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

  const handleImageFiles = async (files: File[]) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
    const imageFiles = files.filter(file => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      return imageExtensions.includes(ext);
    });

    if (imageFiles.length === 0) {
      setError("No image files found in folder");
      return;
    }

    setFileName(`${imageFiles.length} image files`);
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    imageFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setIsUploading(false);
          setUploadProgress(100);
          onUploadComplete(response.images, response.workflowId);
        } else {
          setError("Upload failed. Please try again.");
          setIsUploading(false);
        }
      };

      xhr.onerror = () => {
        setError("Network error. Please try again.");
        setIsUploading(false);
      };

      xhr.open('POST', '/api/upload-folder');
      xhr.send(formData);
    } catch (err) {
      setError("Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.name.endsWith('.zip')) {
      handleZipFile(file);
    } else {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (imageExtensions.includes(ext)) {
        handleImageFiles([file]);
      } else {
        setError("Please upload a ZIP file or image files");
      }
    }
  };

  const hasImages = uploadedImages.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Upload Images</h2>
        <p className="text-muted-foreground mt-1">
          Upload images from a ZIP file or select individual image files
        </p>
      </div>

      <Card className={cn(
        "border-2 transition-colors",
        autoModeSettings.enabled ? "border-primary/50 bg-primary/5" : ""
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                autoModeSettings.enabled ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Auto Mode</CardTitle>
                <CardDescription>
                  Process all steps automatically after upload
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={autoModeSettings.enabled}
              onCheckedChange={(enabled) => onAutoModeChange({ ...autoModeSettings, enabled })}
              data-testid="switch-auto-mode"
            />
          </div>
        </CardHeader>
        {autoModeSettings.enabled && (
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-title"
                    checked={autoModeSettings.autoTitle}
                    onCheckedChange={(autoTitle) => onAutoModeChange({ ...autoModeSettings, autoTitle })}
                    data-testid="switch-auto-title"
                  />
                  <Label htmlFor="auto-title" className="text-sm">
                    Auto-generate title (date + "Update")
                  </Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description-template" className="text-sm">Description Template</Label>
                <Select
                  value={autoModeSettings.selectedTemplateId || "none"}
                  onValueChange={(value) => onAutoModeChange({ 
                    ...autoModeSettings, 
                    selectedTemplateId: value === "none" ? undefined : value 
                  })}
                >
                  <SelectTrigger id="description-template" data-testid="select-description-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No description</SelectItem>
                    {descriptionTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="skip-export"
                  checked={autoModeSettings.skipExport}
                  onCheckedChange={(skipExport) => onAutoModeChange({ ...autoModeSettings, skipExport })}
                  data-testid="switch-skip-export"
                />
                <Label htmlFor="skip-export" className="text-sm">Skip Google Drive export</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="skip-publish"
                  checked={autoModeSettings.skipPublish}
                  onCheckedChange={(skipPublish) => onAutoModeChange({ ...autoModeSettings, skipPublish })}
                  data-testid="switch-skip-publish"
                />
                <Label htmlFor="skip-publish" className="text-sm">Skip WordPress publish</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="skip-deviantart"
                  checked={autoModeSettings.skipDeviantArt}
                  onCheckedChange={(skipDeviantArt) => onAutoModeChange({ ...autoModeSettings, skipDeviantArt })}
                  data-testid="switch-skip-deviantart"
                />
                <Label htmlFor="skip-deviantart" className="text-sm">Skip DeviantArt upload</Label>
              </div>
            </div>
            {isAutoRunning && (
              <div className="flex items-center gap-2 text-primary text-sm mt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Auto mode running...</span>
              </div>
            )}
            {!isAutoRunning && (
              <div className="space-y-2 mt-2">
                {!autoModeSettings.skipPublish && !hasWordPressConfig && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>WordPress credentials not configured - publishing will be skipped</span>
                  </div>
                )}
                {!autoModeSettings.skipExport && !hasDriveConfig && (
                  <div className="flex items-center justify-between gap-2 text-amber-600 dark:text-amber-400 text-sm">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>Google Drive not connected</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const authWindow = window.open('/api/drive/oauth/start', '_blank');
                        const checkInterval = setInterval(() => {
                          if (authWindow?.closed) {
                            clearInterval(checkInterval);
                            onConnectDrive?.();
                          }
                        }, 1000);
                        setTimeout(() => clearInterval(checkInterval), 300000);
                      }}
                      data-testid="button-connect-drive-auto"
                    >
                      Connect Drive
                    </Button>
                  </div>
                )}
                {!autoModeSettings.skipExport && hasDriveConfig && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Google Drive connected</span>
                  </div>
                )}
              </div>
            )}
            
            <div className={cn("mt-4", isAutoRunning && "hidden")}>
              <Accordion type="single" collapsible>
                <AccordionItem value="rename" className="border rounded-lg px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <FileEdit className="h-4 w-4" />
                      <span className="text-sm font-medium">Rename Settings</span>
                      {renameConfig && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {renameConfig.prefix}_{"{n}"}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {renameConfig && onRenameConfigChange && (
                      <div className="space-y-3 py-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Prefix</Label>
                            <Input
                              value={renameConfig.prefix}
                              onChange={(e) => onRenameConfigChange({ ...renameConfig, prefix: e.target.value })}
                              placeholder="civitai"
                              className="h-8 text-sm"
                              data-testid="input-auto-prefix"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Separator</Label>
                            <div className="flex gap-1">
                              {["_", "-", "."].map((sep) => (
                                <Button
                                  key={sep}
                                  size="sm"
                                  variant={renameConfig.separator === sep ? "default" : "outline"}
                                  onClick={() => onRenameConfigChange({ ...renameConfig, separator: sep })}
                                  className="h-8 px-3"
                                  data-testid={`button-auto-sep-${sep}`}
                                >
                                  {sep}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Start Number</Label>
                            <Input
                              type="number"
                              value={renameConfig.startNumber}
                              onChange={(e) => onRenameConfigChange({ ...renameConfig, startNumber: parseInt(e.target.value) || 1 })}
                              className="h-8 text-sm"
                              data-testid="input-auto-start"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Padding ({renameConfig.padding} digits)</Label>
                            <Slider
                              value={[renameConfig.padding]}
                              onValueChange={([v]) => onRenameConfigChange({ ...renameConfig, padding: v })}
                              min={1}
                              max={5}
                              step={1}
                              data-testid="slider-auto-padding"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="enhance" className="border rounded-lg px-3 mt-2">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      <span className="text-sm font-medium">Enhance Settings</span>
                      {enhanceConfig && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {enhanceConfig.resize ? `${enhanceConfig.scaleFactor}%` : "No resize"}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {enhanceConfig && onEnhanceConfigChange && (
                      <div className="space-y-3 py-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Resize Images</Label>
                          <Switch
                            checked={enhanceConfig.resize}
                            onCheckedChange={(resize) => onEnhanceConfigChange({ ...enhanceConfig, resize })}
                            data-testid="switch-auto-resize"
                          />
                        </div>
                        {enhanceConfig.resize && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span>Scale Factor</span>
                              <span className="font-medium">{enhanceConfig.scaleFactor}%</span>
                            </div>
                            <Slider
                              value={[enhanceConfig.scaleFactor]}
                              onValueChange={([v]) => onEnhanceConfigChange({ ...enhanceConfig, scaleFactor: v })}
                              min={10}
                              max={300}
                              step={10}
                              data-testid="slider-auto-scale"
                            />
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Remove EXIF Data</Label>
                          <Switch
                            checked={enhanceConfig.removeExif}
                            onCheckedChange={(removeExif) => onEnhanceConfigChange({ ...enhanceConfig, removeExif })}
                            data-testid="switch-auto-exif"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Output Format</Label>
                          <Select
                            value={enhanceConfig.outputFormat}
                            onValueChange={(outputFormat: any) => onEnhanceConfigChange({ ...enhanceConfig, outputFormat })}
                          >
                            <SelectTrigger className="h-8 text-sm" data-testid="select-auto-format">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="original">Keep Original</SelectItem>
                              <SelectItem value="jpeg">JPEG</SelectItem>
                              <SelectItem value="png">PNG</SelectItem>
                              <SelectItem value="webp">WebP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="export" className="border rounded-lg px-3 mt-2">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      <span className="text-sm font-medium">Export Settings</span>
                      {driveConfig && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {driveConfig.folderPath || "/"}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {driveConfig && onDriveConfigChange && (
                      <div className="space-y-3 py-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Google Drive Folder</Label>
                          <div className="flex gap-2">
                            <Input
                              value={driveConfig.folderPath}
                              onChange={(e) => onDriveConfigChange({ ...driveConfig, folderPath: e.target.value, folderId: undefined })}
                              placeholder="/Civitai Images"
                              className="h-8 text-sm flex-1"
                              data-testid="input-auto-folder"
                            />
                            <Button 
                              variant="outline" 
                              size="icon"
                              className="h-8 w-8"
                              onClick={openFolderBrowser}
                              data-testid="button-browse-folder-auto"
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Create Subfolder</Label>
                          <Switch
                            checked={driveConfig.createSubfolder}
                            onCheckedChange={(createSubfolder) => onDriveConfigChange({ ...driveConfig, createSubfolder })}
                            data-testid="switch-auto-subfolder"
                          />
                        </div>
                        {driveConfig.createSubfolder && (
                          <div className="space-y-1">
                            <Label className="text-xs">Subfolder Name</Label>
                            <Input
                              value={driveConfig.subfolderName}
                              onChange={(e) => onDriveConfigChange({ ...driveConfig, subfolderName: e.target.value })}
                              placeholder="batch-001"
                              className="h-8 text-sm"
                              data-testid="input-auto-subfolder-name"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="publish" className="border rounded-lg px-3 mt-2">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="text-sm font-medium">Publish Settings</span>
                      {wordpressConfig?.siteUrl && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {new URL(wordpressConfig.siteUrl).hostname}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {wordpressConfig && onWordpressConfigChange && (
                      <div className="space-y-3 py-2">
                        <div className="space-y-1">
                          <Label className="text-xs">WordPress Site URL</Label>
                          <Input
                            value={wordpressConfig.siteUrl}
                            onChange={(e) => onWordpressConfigChange({ ...wordpressConfig, siteUrl: e.target.value })}
                            placeholder="https://yoursite.com"
                            className="h-8 text-sm"
                            data-testid="input-auto-site-url"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Username</Label>
                            <Input
                              value={wordpressConfig.username}
                              onChange={(e) => onWordpressConfigChange({ ...wordpressConfig, username: e.target.value })}
                              placeholder="admin"
                              className="h-8 text-sm"
                              data-testid="input-auto-username"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">App Password</Label>
                            <Input
                              type="password"
                              value={wordpressConfig.applicationPassword}
                              onChange={(e) => onWordpressConfigChange({ ...wordpressConfig, applicationPassword: e.target.value })}
                              placeholder="xxxx xxxx xxxx"
                              className="h-8 text-sm font-mono"
                              data-testid="input-auto-app-password"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ARMember API Key</Label>
                          <Input
                            type="password"
                            value={wordpressConfig.armemberApiKey || ""}
                            onChange={(e) => onWordpressConfigChange({ ...wordpressConfig, armemberApiKey: e.target.value })}
                            placeholder="vw8VKY6vu..."
                            className="h-8 text-sm font-mono"
                            data-testid="input-auto-armember-key"
                          />
                        </div>
                        {armemberPlans.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs">Membership Plan</Label>
                            <Select
                              value={wordpressConfig.armemberPlanId || "public"}
                              onValueChange={(value) => onWordpressConfigChange({ 
                                ...wordpressConfig, 
                                armemberPlanId: value === "public" ? undefined : value 
                              })}
                            >
                              <SelectTrigger className="h-8 text-sm" data-testid="select-auto-plan">
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
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Post Status</Label>
                          <Select
                            value={wordpressConfig.postStatus}
                            onValueChange={(postStatus: any) => onWordpressConfigChange({ ...wordpressConfig, postStatus })}
                          >
                            <SelectTrigger className="h-8 text-sm" data-testid="select-auto-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Save as Draft</SelectItem>
                              <SelectItem value="pending">Pending Review</SelectItem>
                              <SelectItem value="publish">Publish Immediately</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">File Upload</CardTitle>
          <CardDescription>
            Choose to upload a ZIP file or select image files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={uploadType} onValueChange={(v) => {
            setUploadType(v as "zip" | "images" | "civitai");
            if (v === "civitai" && !civitaiStatus) {
              checkCivitaiStatus().then(connected => {
                if (connected) loadCivitaiImages(true);
              });
            }
          }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="zip" className="flex items-center gap-2" data-testid="tab-zip-upload">
                <FileArchive className="h-4 w-4" />
                ZIP File
              </TabsTrigger>
              <TabsTrigger value="images" className="flex items-center gap-2" data-testid="tab-images-upload">
                <Images className="h-4 w-4" />
                Images
              </TabsTrigger>
              <TabsTrigger value="civitai" className="flex items-center gap-2" data-testid="tab-civitai-import">
                <Sparkles className="h-4 w-4" />
                Civitai
              </TabsTrigger>
            </TabsList>

            <TabsContent value="zip" className="mt-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-12 transition-colors",
                  "flex flex-col items-center justify-center gap-4 text-center",
                  isDragging && "border-primary bg-primary/5",
                  !isDragging && !hasImages && "border-muted-foreground/25 hover:border-muted-foreground/50",
                  hasImages && "border-green-500/50 bg-green-500/5"
                )}
                data-testid="upload-dropzone-zip"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    <div className="space-y-2 w-full max-w-xs">
                      <p className="text-sm font-medium">Uploading {fileName}...</p>
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                    </div>
                  </>
                ) : hasImages ? (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        {uploadedImages.length} images uploaded successfully
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        From: {fileName}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('file-input')?.click()}
                      data-testid="button-upload-new-zip"
                    >
                      Upload Different File
                    </Button>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "p-4 rounded-full",
                      isDragging ? "bg-primary/10" : "bg-muted"
                    )}>
                      {isDragging ? (
                        <FileArchive className="h-10 w-10 text-primary" />
                      ) : (
                        <Upload className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {isDragging ? "Drop your ZIP file here" : "Drop ZIP file here or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports .zip files containing images
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('file-input')?.click()}
                      data-testid="button-browse-zip"
                    >
                      Browse Files
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="images" className="mt-4">
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-12 transition-colors",
                  "flex flex-col items-center justify-center gap-4 text-center",
                  !hasImages && "border-muted-foreground/25 hover:border-muted-foreground/50",
                  hasImages && "border-green-500/50 bg-green-500/5"
                )}
                data-testid="upload-dropzone-images"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    <div className="space-y-2 w-full max-w-xs">
                      <p className="text-sm font-medium">Uploading {fileName}...</p>
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                    </div>
                  </>
                ) : hasImages ? (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        {uploadedImages.length} images uploaded successfully
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        From: {fileName}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => imagesInputRef.current?.click()}
                      data-testid="button-upload-new-images"
                    >
                      Select Different Images
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-muted">
                      <Images className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Click to select image files
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports JPG, PNG, WebP, GIF, BMP, TIFF images
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => imagesInputRef.current?.click()}
                      data-testid="button-browse-images"
                    >
                      Select Images
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="civitai" className="mt-4">
              <div className="space-y-4">
                {civitaiStatus === null ? (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">Checking Civitai connection...</p>
                  </div>
                ) : !civitaiStatus.connected ? (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg border-muted-foreground/25">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-sm font-medium mb-2">Civitai Not Connected</p>
                    <p className="text-xs text-muted-foreground text-center max-w-sm">
                      Add your CIVITAI_API_KEY to the Secrets tab to import your generations.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {civitaiStatus.username}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {civitaiImages.length} images loaded
                            {loadingTarget && ` (loading ${loadingTarget}...)`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadCivitaiImages(true)}
                            disabled={civitaiLoading}
                            data-testid="button-refresh-civitai"
                          >
                            <RefreshCw className={cn("h-4 w-4 mr-2", civitaiLoading && "animate-spin")} />
                            Refresh
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={selectAllCivitaiImages}
                            disabled={civitaiImages.length === 0}
                            data-testid="button-select-all-civitai"
                          >
                            {selectedCivitaiImages.size === civitaiImages.length ? 'Deselect All' : 'Select All'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={importCivitaiImages}
                            disabled={selectedCivitaiImages.size === 0 || isImporting}
                            data-testid="button-import-civitai"
                          >
                            {isImporting ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Import {selectedCivitaiImages.size > 0 && `(${selectedCivitaiImages.size})`}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="delete-after-import"
                            checked={deleteAfterImport}
                            onCheckedChange={setDeleteAfterImport}
                            data-testid="switch-delete-after-import"
                          />
                          <Label htmlFor="delete-after-import" className="text-sm cursor-pointer">
                            Delete from Civitai after import
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Load:</span>
                          {[40, 80, 120].map((count) => (
                            <Button
                              key={count}
                              variant="outline"
                              size="sm"
                              onClick={() => loadCivitaiImages(true, count)}
                              disabled={civitaiLoading}
                              className="h-7 px-2 text-xs"
                              data-testid={`button-load-${count}-civitai`}
                            >
                              {count}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {civitaiLoading && civitaiImages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                        <p className="text-sm text-muted-foreground">Loading your generations...</p>
                      </div>
                    ) : civitaiImages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg border-muted-foreground/25">
                        <Images className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-sm font-medium mb-2">No Generations Found</p>
                        <p className="text-xs text-muted-foreground text-center">
                          Your Civitai generations will appear here.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <ArrowUpDown className="h-3 w-3" />
                            <span>Sorted by: Newest first</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {civitaiImages.length} images loaded
                          </div>
                        </div>
                        <ScrollArea className="h-[400px] border rounded-lg p-2">
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                            {civitaiImages.map((image, index) => (
                              <div
                                key={image.id}
                                className={cn(
                                  "relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all",
                                  "hover:ring-2 hover:ring-primary/50",
                                  selectedCivitaiImages.has(image.id) && "ring-2 ring-primary"
                                )}
                                onClick={() => toggleCivitaiImage(image.id)}
                                data-testid={`civitai-image-${image.id}`}
                              >
                                <img
                                  src={image.url}
                                  alt={`Civitai generation ${image.id}`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1 rounded">
                                  #{index + 1}
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                                  <p className="text-[9px] text-white/80 truncate">
                                    {new Date(image.createdAt).toLocaleDateString()} {new Date(image.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                </div>
                                {selectedCivitaiImages.has(image.id) && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <div className="bg-primary rounded-full p-1">
                                      <Check className="h-4 w-4 text-primary-foreground" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>

                        {civitaiImages.length > 0 && (
                          <div className="flex justify-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground self-center">Load newest:</span>
                            {[40, 80, 120].map((count) => (
                              <Button
                                key={count}
                                variant="outline"
                                size="sm"
                                onClick={() => loadCivitaiImages(true, count)}
                                disabled={civitaiLoading}
                                className="h-7 px-3 text-xs"
                                data-testid={`button-load-newest-${count}-civitai`}
                              >
                                {civitaiLoading && loadingTarget === count ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : null}
                                {count}
                              </Button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <input
            id="file-input"
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleFileInput}
            data-testid="input-file-upload"
          />
          <input
            ref={imagesInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagesInput}
            multiple
            data-testid="input-images-upload"
          />

          {error && (
            <div className="mt-4 flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {hasImages && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extracted Images</CardTitle>
            <CardDescription>
              Preview of images from your ZIP file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {uploadedImages.slice(0, 10).map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                  data-testid={`image-preview-${image.id}`}
                >
                  <img
                    src={`/api/thumbnail/${image.id}`}
                    alt={image.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white truncate">{image.originalName}</p>
                  </div>
                </div>
              ))}
            </div>
            {uploadedImages.length > 10 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                +{uploadedImages.length - 10} more images
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
                    data-testid={`folder-auto-${folder.id}`}
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
            <Button onClick={selectFolderFromBrowser} data-testid="button-select-folder-auto">
              {selectedFolder ? `Select "${selectedFolder.name}"` : folderPath.length > 0 ? `Use "${folderPath[folderPath.length - 1].name}"` : "Use Root"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
