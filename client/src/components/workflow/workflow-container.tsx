import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Loader2, CheckCircle } from "lucide-react";
import { UploadStep } from "./upload-step";
import { RenameStep } from "./rename-step";
import { EnhanceStep } from "./enhance-step";
import { ExportStep } from "./export-step";
import { PublishStep } from "./publish-step";
import type { 
  ProcessedImage, 
  RenameConfig, 
  EnhanceConfig, 
  DriveConfig, 
  WordPressConfig,
  ARMemberPlan,
  DescriptionTemplate,
  AutoModeSettings
} from "@/lib/types";

interface WorkflowContainerProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  onStepComplete: (step: number) => void;
}

const DEFAULT_RENAME_CONFIG: RenameConfig = {
  prefix: "civitai",
  startNumber: 1,
  padding: 3,
  separator: "_",
};

const DEFAULT_ENHANCE_CONFIG: EnhanceConfig = {
  resize: false,
  resizeMode: "scale",
  scaleFactor: 100,
  width: 1920,
  height: 1080,
  maintainAspectRatio: true,
  removeExif: true,
  addWatermark: false,
  watermarkText: "",
  watermarkPosition: "bottom-right",
  watermarkImages: [],
  outputFormat: "original",
  quality: 90,
};

const DEFAULT_AUTO_MODE: AutoModeSettings = {
  enabled: false,
  autoTitle: true,
  selectedTemplateId: undefined,
  skipRename: false,
  skipEnhance: false,
  skipExport: false,
  skipPublish: false,
  skipDeviantArt: false,
};

const DEFAULT_TEMPLATES: DescriptionTemplate[] = [
  { id: "1", name: "New Gallery", title: "New Gallery Update", content: "Discover our latest gallery featuring fresh AI-generated artwork. Browse through this stunning collection of digital creations." },
  { id: "2", name: "Weekly Update", title: "Weekly Art Update", content: "This week's curated selection of AI-generated masterpieces. Explore the latest additions to our growing collection of digital art." },
  { id: "3", name: "Featured Collection", title: "Featured Art Collection", content: "A hand-picked collection of our finest AI-generated content. These pieces represent the best of what our gallery has to offer." },
  { id: "4", name: "Premium Content", title: "Premium Member Content", content: "Exclusive premium content crafted for our valued members. Enjoy this special selection of high-quality AI artwork." },
  { id: "5", name: "Creative Showcase", title: "Creative Art Showcase", content: "Showcasing the latest innovations in AI-generated creativity. Explore unique artistic styles and stunning visual compositions." },
  { id: "6", name: "Member Exclusive", title: "Member Exclusive Gallery", content: "Special content created exclusively for our members. Thank you for being part of our community." },
  { id: "7", name: "Art Collection", title: "Art Collection Update", content: "A beautiful new collection of AI-generated art pieces. Each image has been carefully selected for quality and artistic merit." },
  { id: "8", name: "Daily Highlights", title: "Daily Art Highlights", content: "Today's featured highlights from our AI art collection. Fresh content delivered daily for your viewing pleasure." },
  { id: "9", name: "New Arrivals", title: "New Arrivals Gallery", content: "Just arrived! Fresh new additions to our gallery. Be among the first to explore these newly generated artworks." },
  { id: "10", name: "Custom", title: "", content: "" },
];

function generateAutoTitle(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }) + " Update";
}

async function loadServerSettings(): Promise<{
  renameConfig?: RenameConfig;
  enhanceConfig?: EnhanceConfig;
  driveConfig?: DriveConfig;
  wordpressConfig?: Partial<WordPressConfig>;
  autoModeSettings?: AutoModeSettings;
  descriptionTemplates?: DescriptionTemplate[];
} | null> {
  try {
    const response = await fetch('/api/settings');
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error("Failed to load settings from server:", e);
  }
  return null;
}

async function saveServerSettings(settings: {
  renameConfig: RenameConfig;
  enhanceConfig: EnhanceConfig;
  driveConfig: DriveConfig;
  wordpressConfig: Partial<WordPressConfig>;
  autoModeSettings?: AutoModeSettings;
  descriptionTemplates?: DescriptionTemplate[];
}) {
  try {
    const toSave = {
      ...settings,
      wordpressConfig: {
        siteUrl: settings.wordpressConfig.siteUrl,
        username: settings.wordpressConfig.username,
        applicationPassword: settings.wordpressConfig.applicationPassword,
        armemberApiKey: settings.wordpressConfig.armemberApiKey,
      },
    };
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSave),
    });
  } catch (e) {
    console.error("Failed to save settings to server:", e);
  }
}

const DEFAULT_DRIVE_CONFIG: DriveConfig = {
  folderPath: "/Civitai Images",
  createSubfolder: false,
  subfolderName: "",
};

const DEFAULT_WORDPRESS_CONFIG: WordPressConfig = {
  siteUrl: "",
  username: "",
  applicationPassword: "",
  postStatus: "draft",
  postTitle: "",
  postContent: "",
};

export function WorkflowContainer({ currentStep, onStepChange, onStepComplete }: WorkflowContainerProps) {
  const { toast } = useToast();
  
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [renameConfig, setRenameConfig] = useState<RenameConfig>(DEFAULT_RENAME_CONFIG);
  const [enhanceConfig, setEnhanceConfig] = useState<EnhanceConfig>(DEFAULT_ENHANCE_CONFIG);
  const [driveConfig, setDriveConfig] = useState<DriveConfig>(DEFAULT_DRIVE_CONFIG);
  const [wordpressConfig, setWordpressConfig] = useState<WordPressConfig>(DEFAULT_WORDPRESS_CONFIG);
  const [armemberPlans, setArmemberPlans] = useState<ARMemberPlan[]>([]);
  const [autoModeSettings, setAutoModeSettings] = useState<AutoModeSettings>(DEFAULT_AUTO_MODE);
  const [descriptionTemplates, setDescriptionTemplates] = useState<DescriptionTemplate[]>(DEFAULT_TEMPLATES);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [publishedPostUrl, setPublishedPostUrl] = useState<string | null>(null);
  
  const autoModeSettingsRef = useRef(autoModeSettings);
  useEffect(() => {
    autoModeSettingsRef.current = autoModeSettings;
  }, [autoModeSettings]);

  useEffect(() => {
    loadServerSettings().then((saved) => {
      if (saved) {
        if (saved.renameConfig) setRenameConfig(saved.renameConfig);
        if (saved.enhanceConfig) setEnhanceConfig({ ...DEFAULT_ENHANCE_CONFIG, ...saved.enhanceConfig });
        if (saved.driveConfig) setDriveConfig(saved.driveConfig);
        if (saved.wordpressConfig) setWordpressConfig({ ...DEFAULT_WORDPRESS_CONFIG, ...saved.wordpressConfig });
        if (saved.autoModeSettings) {
          const merged = { ...DEFAULT_AUTO_MODE, ...saved.autoModeSettings };
          setAutoModeSettings(merged);
          if (merged.skipRename) setSkipRename(true);
          if (merged.skipEnhance) setSkipEnhance(true);
          if (merged.skipExport) setSkipExport(true);
        }
        if (saved.descriptionTemplates?.length) setDescriptionTemplates(saved.descriptionTemplates);
      }
      setSettingsLoaded(true);
    });
  }, []);
  
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [driveEmail, setDriveEmail] = useState<string | undefined>(undefined);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isWpVerifying, setIsWpVerifying] = useState(false);
  const [isWpVerified, setIsWpVerified] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [skipRename, setSkipRename] = useState(false);
  const [skipEnhance, setSkipEnhance] = useState(false);
  const [skipExport, setSkipExport] = useState(false);

  useEffect(() => {
    if (settingsLoaded) {
      saveServerSettings({ renameConfig, enhanceConfig, driveConfig, wordpressConfig, autoModeSettings, descriptionTemplates });
    }
  }, [renameConfig, enhanceConfig, driveConfig, wordpressConfig, autoModeSettings, descriptionTemplates, settingsLoaded]);

  // Auto-verify WordPress and fetch ARMember plans on settings load
  useEffect(() => {
    if (settingsLoaded && wordpressConfig.siteUrl && wordpressConfig.username && wordpressConfig.applicationPassword) {
      (async () => {
        try {
          const response = await fetch('/api/wordpress/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteUrl: wordpressConfig.siteUrl,
              username: wordpressConfig.username,
              applicationPassword: wordpressConfig.applicationPassword,
              armemberApiKey: wordpressConfig.armemberApiKey,
            }),
          });
          const data = await response.json();
          if (response.ok) {
            setIsWpVerified(true);
            if (data.armemberPlans) {
              setArmemberPlans(data.armemberPlans);
            }
          }
        } catch (error) {
          console.log('Auto-verify failed:', error);
        }
      })();
    }
  }, [settingsLoaded]);

  const runAutoMode = useCallback(async (wfId: string, uploadedImages: ProcessedImage[]) => {
    console.log('[AutoMode] Starting auto mode for workflow:', wfId);
    setIsAutoRunning(true);
    
    try {
      console.log('[AutoMode] Moving to step 2 (Rename)');
      onStepChange(2);
      onStepComplete(2);
      await new Promise(r => setTimeout(r, 300));
      
      console.log('[AutoMode] Moving to step 3 (Enhance)');
      onStepChange(3);
      await new Promise(r => setTimeout(r, 300));
      
      console.log('[AutoMode] Processing images...');
      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: wfId,
          renameConfig,
          enhanceConfig,
          skipRename: autoModeSettings.skipRename,
          skipEnhance: autoModeSettings.skipEnhance,
        }),
      });
      
      const processData = await processResponse.json();
      if (!processResponse.ok) {
        throw new Error(processData.message || 'Processing failed');
      }
      setImages(processData.images);
      onStepComplete(3);
      
      onStepChange(4);
      await new Promise(r => setTimeout(r, 300));
      
      if (!autoModeSettings.skipExport) {
        const driveStatusResponse = await fetch('/api/drive/status');
        const driveStatus = await driveStatusResponse.json();
        
        if (driveStatus.connected) {
          setIsDriveConnected(true);
          const exportResponse = await fetch('/api/drive/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workflowId: wfId,
              driveConfig,
            }),
          });
          
          const exportData = await exportResponse.json();
          if (!exportResponse.ok) {
            toast({
              title: "Export Warning",
              description: exportData.message || "Export failed",
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Export Skipped",
            description: "Google Drive not connected",
          });
        }
      } else {
        toast({
          title: "Export Skipped",
          description: "Skipped per auto mode settings",
        });
      }
      onStepComplete(4);
      
      onStepChange(5);
      await new Promise(r => setTimeout(r, 300));
      
      if (!autoModeSettings.skipPublish && wordpressConfig.siteUrl && wordpressConfig.username && wordpressConfig.applicationPassword) {
        const template = descriptionTemplates.find(t => t.id === autoModeSettings.selectedTemplateId);
        const postTitle = autoModeSettings.autoTitle 
          ? generateAutoTitle() 
          : (template?.title || wordpressConfig.postTitle || generateAutoTitle());
        const postContent = template ? template.content : wordpressConfig.postContent;
        
        const publishResponse = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId: wfId,
            wordpressConfig: {
              ...wordpressConfig,
              postTitle,
              postContent,
            },
          }),
        });
        
        const publishData = await publishResponse.json();
        if (publishResponse.ok) {
          onStepComplete(5);
          if (publishData.postUrl) {
            setPublishedPostUrl(publishData.postUrl);
          }
          toast({
            title: "Auto Mode Complete",
            description: `Published: ${publishData.postUrl || 'Check WordPress admin'}`,
          });
        } else {
          toast({
            title: "Publish Warning",
            description: publishData.message || "Publishing failed",
            variant: "destructive",
          });
        }
      } else {
        onStepComplete(5);
        toast({
          title: "Auto Mode Complete",
          description: `Processed ${uploadedImages.length} images successfully`,
        });
      }
      
      onStepChange(1);
    } catch (error: any) {
      toast({
        title: "Auto Mode Error",
        description: error.message || "An error occurred during auto processing",
        variant: "destructive",
      });
    } finally {
      setIsAutoRunning(false);
    }
  }, [renameConfig, enhanceConfig, driveConfig, wordpressConfig, autoModeSettings, descriptionTemplates, onStepChange, onStepComplete, toast]);

  const runAutoModeRef = useRef(runAutoMode);
  useEffect(() => {
    runAutoModeRef.current = runAutoMode;
  }, [runAutoMode]);

  const handleUploadComplete = useCallback((uploadedImages: ProcessedImage[], id: string) => {
    console.log('[Upload] Complete with', uploadedImages.length, 'images, workflow:', id);
    console.log('[Upload] Auto mode enabled (ref):', autoModeSettingsRef.current.enabled);
    setImages(uploadedImages);
    setWorkflowId(id);
    onStepComplete(1);
    toast({
      title: "Upload Complete",
      description: `${uploadedImages.length} images extracted successfully`,
    });
    
    if (autoModeSettingsRef.current.enabled) {
      console.log('[Upload] Triggering auto mode via ref...');
      setTimeout(() => {
        runAutoModeRef.current(id, uploadedImages);
      }, 100);
    }
  }, [onStepComplete, toast]);

  const handleRenameConfigChange = useCallback((config: RenameConfig) => {
    setRenameConfig(config);
  }, []);

  const handleEnhanceConfigChange = useCallback((config: EnhanceConfig) => {
    setEnhanceConfig(config);
  }, []);

  const handleDriveConfigChange = useCallback((config: DriveConfig) => {
    setDriveConfig(config);
  }, []);

  const handleDriveConnect = useCallback(async () => {
    setIsConnectingDrive(true);
    try {
      const response = await fetch('/api/drive/status');
      const data = await response.json();
      setIsDriveConnected(data.connected);
      setDriveEmail(data.email);
      if (data.connected) {
        toast({
          title: "Google Drive Connected",
          description: data.email ? `Connected as ${data.email}` : "You can now export files to your Drive",
        });
      }
    } catch (error) {
      console.error('Drive status check failed:', error);
    } finally {
      setIsConnectingDrive(false);
    }
  }, [toast]);

  const handleDriveDisconnect = useCallback(async () => {
    try {
      await fetch('/api/drive/disconnect', { method: 'POST' });
      setIsDriveConnected(false);
      setDriveEmail(undefined);
      toast({
        title: "Disconnected",
        description: "Google Drive has been disconnected",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to disconnect Google Drive",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleWordpressConfigChange = useCallback((config: WordPressConfig) => {
    setWordpressConfig((prevConfig) => {
      const credentialsChanged = 
        config.siteUrl !== prevConfig.siteUrl ||
        config.username !== prevConfig.username ||
        config.applicationPassword !== prevConfig.applicationPassword;
      
      if (credentialsChanged && isWpVerified) {
        setIsWpVerified(false);
      }
      return config;
    });
  }, [isWpVerified]);

  const handleRemoveImage = useCallback(async (imageId: string) => {
    if (workflowId) {
      try {
        await fetch(`/api/images/${workflowId}/${imageId}`, { method: 'DELETE' });
      } catch (error) {
        console.error('Failed to delete image from server:', error);
      }
    }
    setImages(prev => prev.filter(img => img.id !== imageId));
  }, [workflowId]);

  const handleSkipRenameChange = useCallback((value: boolean) => {
    setSkipRename(value);
    setAutoModeSettings(prev => ({ ...prev, skipRename: value }));
  }, []);

  const handleSkipEnhanceChange = useCallback((value: boolean) => {
    setSkipEnhance(value);
    setAutoModeSettings(prev => ({ ...prev, skipEnhance: value }));
  }, []);

  const handleSkipExportChange = useCallback((value: boolean) => {
    setSkipExport(value);
    setAutoModeSettings(prev => ({ ...prev, skipExport: value }));
  }, []);

  const handleWpVerify = useCallback(async () => {
    setIsWpVerifying(true);
    try {
      const response = await fetch('/api/wordpress/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: wordpressConfig.siteUrl,
          username: wordpressConfig.username,
          applicationPassword: wordpressConfig.applicationPassword,
          armemberApiKey: wordpressConfig.armemberApiKey,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setIsWpVerified(true);
        if (data.armemberPlans) {
          setArmemberPlans(data.armemberPlans);
        }
        toast({
          title: "Connection Verified",
          description: "WordPress site is ready for publishing",
        });
      } else {
        toast({
          title: "Verification Failed",
          description: data.message || "Could not connect to WordPress",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Failed to verify WordPress connection",
        variant: "destructive",
      });
    } finally {
      setIsWpVerifying(false);
    }
  }, [wordpressConfig, toast]);

  const handleProcessAndNext = useCallback(async () => {
    if (currentStep === 1) {
      onStepComplete(1);
      onStepChange(2);
    } else if (currentStep === 2) {
      onStepComplete(2);
      onStepChange(3);
    } else if (currentStep === 3) {
      setIsProcessing(true);
      try {
        const response = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId,
            renameConfig,
            enhanceConfig,
            skipRename,
            skipEnhance,
          }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          setImages(data.images);
          onStepComplete(3);
          onStepChange(4);
          toast({
            title: "Processing Complete",
            description: `${data.images.length} images processed successfully`,
          });
        } else {
          toast({
            title: "Processing Failed",
            description: data.message || "Could not process images",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Processing Error",
          description: "Failed to process images",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    } else if (currentStep === 4) {
      if (isDriveConnected && !skipExport) {
        setIsProcessing(true);
        try {
          const response = await fetch('/api/drive/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workflowId,
              driveConfig,
            }),
          });
          
          const data = await response.json();
          
          if (response.ok) {
            toast({
              title: "Export Complete",
              description: data.message || `Uploaded ${data.uploadedCount} files to Google Drive`,
            });
          } else {
            toast({
              title: "Export Failed",
              description: data.message || "Could not export to Google Drive",
              variant: "destructive",
            });
          }
        } catch (error) {
          toast({
            title: "Export Error",
            description: "Failed to export to Google Drive",
            variant: "destructive",
          });
        } finally {
          setIsProcessing(false);
        }
      } else if (skipExport) {
        toast({
          title: "Export Skipped",
          description: "Proceeding to next step",
        });
      }
      onStepComplete(4);
      onStepChange(5);
    } else if (currentStep === 5) {
      setIsProcessing(true);
      try {
        const response = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId,
            wordpressConfig,
          }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
          onStepComplete(5);
          if (data.postUrl) {
            setPublishedPostUrl(data.postUrl);
          }
          toast({
            title: "Published Successfully",
            description: `Post created: ${data.postUrl || 'Check your WordPress admin'}`,
          });
        } else {
          toast({
            title: "Publishing Failed",
            description: data.message || "Could not publish to WordPress",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Publishing Error",
          description: "Failed to publish to WordPress",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    }
  }, [currentStep, workflowId, renameConfig, enhanceConfig, driveConfig, wordpressConfig, isDriveConnected, onStepChange, onStepComplete, toast]);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 1:
        return images.length > 0;
      case 2:
        return skipRename || renameConfig.prefix.length > 0;
      case 3:
        return true;
      case 4:
        return true;
      case 5:
        return isWpVerified;
      default:
        return false;
    }
  }, [currentStep, images, renameConfig, isWpVerified, skipRename]);

  const getNextButtonText = () => {
    switch (currentStep) {
      case 1:
        return "Continue to Rename";
      case 2:
        return "Continue to Enhance";
      case 3:
        return "Process & Continue";
      case 4:
        return "Continue to Publish";
      case 5:
        return "Publish to WordPress";
      default:
        return "Next";
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <UploadStep
            onUploadComplete={handleUploadComplete}
            uploadedImages={images}
            workflowId={workflowId}
            autoModeSettings={autoModeSettings}
            onAutoModeChange={setAutoModeSettings}
            descriptionTemplates={descriptionTemplates}
            isAutoRunning={isAutoRunning}
            hasWordPressConfig={!!(wordpressConfig.siteUrl && wordpressConfig.username && wordpressConfig.applicationPassword)}
            hasDriveConfig={isDriveConnected}
            onConnectDrive={handleDriveConnect}
            isConnectingDrive={isConnectingDrive}
            renameConfig={renameConfig}
            onRenameConfigChange={handleRenameConfigChange}
            enhanceConfig={enhanceConfig}
            onEnhanceConfigChange={handleEnhanceConfigChange}
            driveConfig={driveConfig}
            onDriveConfigChange={handleDriveConfigChange}
            wordpressConfig={wordpressConfig}
            onWordpressConfigChange={handleWordpressConfigChange}
            armemberPlans={armemberPlans}
            onRemoveImage={handleRemoveImage}
          />
        );
      case 2:
        return (
          <RenameStep
            images={images}
            config={renameConfig}
            onConfigChange={handleRenameConfigChange}
            skipRename={skipRename}
            onSkipRenameChange={handleSkipRenameChange}
          />
        );
      case 3:
        return (
          <EnhanceStep
            images={images}
            config={enhanceConfig}
            onConfigChange={handleEnhanceConfigChange}
            skipEnhance={skipEnhance}
            onSkipEnhanceChange={handleSkipEnhanceChange}
          />
        );
      case 4:
        return (
          <ExportStep
            images={images}
            config={driveConfig}
            onConfigChange={handleDriveConfigChange}
            isConnected={isDriveConnected}
            connectedEmail={driveEmail}
            onRefreshStatus={handleDriveConnect}
            onDisconnect={handleDriveDisconnect}
            workflowId={workflowId}
            skipExport={skipExport}
            onSkipExportChange={handleSkipExportChange}
          />
        );
      case 5:
        return (
          <PublishStep
            images={images}
            config={wordpressConfig}
            onConfigChange={handleWordpressConfigChange}
            armemberPlans={armemberPlans}
            isVerifying={isWpVerifying}
            isVerified={isWpVerified}
            onVerify={handleWpVerify}
            publishedPostUrl={publishedPostUrl}
            onClearPublishedUrl={() => setPublishedPostUrl(null)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6">
        {renderStep()}
      </div>
      
      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => onStepChange(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            data-testid="button-previous-step"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          
          <div className="text-sm text-muted-foreground">
            Step {currentStep} of 5
          </div>
          
          <Button
            onClick={handleProcessAndNext}
            disabled={!canProceed() || isProcessing}
            data-testid="button-next-step"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : currentStep === 5 ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                {getNextButtonText()}
              </>
            ) : (
              <>
                {getNextButtonText()}
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
