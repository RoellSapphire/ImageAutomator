import { useState, useCallback, useEffect } from "react";
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
  ARMemberPlan 
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

const STORAGE_KEY = "civitai-flow-settings";

function loadSavedSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load saved settings:", e);
  }
  return null;
}

function saveSettings(settings: {
  renameConfig: RenameConfig;
  enhanceConfig: EnhanceConfig;
  driveConfig: DriveConfig;
  wordpressConfig: Partial<WordPressConfig>;
}) {
  try {
    const toSave = {
      ...settings,
      wordpressConfig: {
        siteUrl: settings.wordpressConfig.siteUrl,
        username: settings.wordpressConfig.username,
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("Failed to save settings:", e);
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
  const [renameConfig, setRenameConfig] = useState<RenameConfig>(() => {
    const saved = loadSavedSettings();
    return saved?.renameConfig || DEFAULT_RENAME_CONFIG;
  });
  const [enhanceConfig, setEnhanceConfig] = useState<EnhanceConfig>(() => {
    const saved = loadSavedSettings();
    return saved?.enhanceConfig ? { ...DEFAULT_ENHANCE_CONFIG, ...saved.enhanceConfig } : DEFAULT_ENHANCE_CONFIG;
  });
  const [driveConfig, setDriveConfig] = useState<DriveConfig>(() => {
    const saved = loadSavedSettings();
    return saved?.driveConfig || DEFAULT_DRIVE_CONFIG;
  });
  const [wordpressConfig, setWordpressConfig] = useState<WordPressConfig>(() => {
    const saved = loadSavedSettings();
    return saved?.wordpressConfig 
      ? { ...DEFAULT_WORDPRESS_CONFIG, ...saved.wordpressConfig }
      : DEFAULT_WORDPRESS_CONFIG;
  });
  const [armemberPlans, setArmemberPlans] = useState<ARMemberPlan[]>([]);
  
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isWpVerifying, setIsWpVerifying] = useState(false);
  const [isWpVerified, setIsWpVerified] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    saveSettings({ renameConfig, enhanceConfig, driveConfig, wordpressConfig });
  }, [renameConfig, enhanceConfig, driveConfig, wordpressConfig]);

  const handleUploadComplete = useCallback((uploadedImages: ProcessedImage[], id: string) => {
    setImages(uploadedImages);
    setWorkflowId(id);
    onStepComplete(1);
    toast({
      title: "Upload Complete",
      description: `${uploadedImages.length} images extracted successfully`,
    });
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
    try {
      const response = await fetch('/api/drive/status');
      const data = await response.json();
      setIsDriveConnected(data.connected);
      if (data.connected) {
        toast({
          title: "Google Drive Connected",
          description: "You can now export files to your Drive",
        });
      } else {
        toast({
          title: "Drive Not Connected",
          description: "Please connect Google Drive in Replit settings",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection Check Failed",
        description: "Could not verify Google Drive connection",
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
      if (isDriveConnected) {
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
        return renameConfig.prefix.length > 0;
      case 3:
        return true;
      case 4:
        return true;
      case 5:
        return isWpVerified;
      default:
        return false;
    }
  }, [currentStep, images, renameConfig, isWpVerified]);

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
          />
        );
      case 2:
        return (
          <RenameStep
            images={images}
            config={renameConfig}
            onConfigChange={handleRenameConfigChange}
          />
        );
      case 3:
        return (
          <EnhanceStep
            images={images}
            config={enhanceConfig}
            onConfigChange={handleEnhanceConfigChange}
          />
        );
      case 4:
        return (
          <ExportStep
            images={images}
            config={driveConfig}
            onConfigChange={handleDriveConfigChange}
            isConnected={isDriveConnected}
            onConnect={handleDriveConnect}
            workflowId={workflowId}
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
