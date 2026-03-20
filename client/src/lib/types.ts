// Re-export schema types for frontend use
export type {
  WorkflowStatus,
  ProcessedImage,
  RenameConfig,
  EnhanceConfig,
  WatermarkImage,
  WordPressConfig,
  DriveConfig,
  WorkflowState,
  UploadResponse,
  ProcessRequest,
  PublishRequest,
  ARMemberPlan,
  DescriptionTemplate,
  AutoModeSettings,
  FolderMapping,
  WorkflowPreset,
  CivitaiAutoFetchSettings,
  PublishTarget,
  ProofDisplayName,
} from "@shared/schema";

// Workflow step definitions
export interface WorkflowStep {
  id: number;
  title: string;
  description: string;
  icon: string;
  status: "pending" | "active" | "completed" | "error";
}

export const WORKFLOW_STEPS: Omit<WorkflowStep, "status">[] = [
  {
    id: 1,
    title: "Upload",
    description: "Upload ZIP file from Civitai",
    icon: "upload",
  },
  {
    id: 2,
    title: "Rename",
    description: "Configure file naming pattern",
    icon: "edit",
  },
  {
    id: 3,
    title: "Enhance",
    description: "Resize and process images",
    icon: "image",
  },
  {
    id: 4,
    title: "Export",
    description: "Save to Google Drive",
    icon: "folder",
  },
  {
    id: 5,
    title: "Publish",
    description: "Post to WordPress",
    icon: "globe",
  },
];
