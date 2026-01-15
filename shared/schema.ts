import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table (kept for compatibility)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Workflow Types
export const workflowStatusEnum = z.enum(["pending", "processing", "completed", "error"]);
export type WorkflowStatus = z.infer<typeof workflowStatusEnum>;

// Processed Image
export const processedImageSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  newName: z.string(),
  originalPath: z.string(),
  processedPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  originalSize: z.number(),
  processedSize: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  format: z.string(),
  status: workflowStatusEnum,
  error: z.string().optional(),
});

export type ProcessedImage = z.infer<typeof processedImageSchema>;

// Rename Configuration
export const renameConfigSchema = z.object({
  prefix: z.string().min(1, "Prefix is required"),
  startNumber: z.number().min(0).default(1),
  padding: z.number().min(1).max(5).default(3),
  separator: z.string().default("_"),
});

export type RenameConfig = z.infer<typeof renameConfigSchema>;

// Watermark Image Configuration
export const watermarkImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  opacity: z.number().min(0).max(100).default(50),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center", "tile"]).default("bottom-right"),
  scale: z.number().min(5).max(100).default(20),
});

export type WatermarkImage = z.infer<typeof watermarkImageSchema>;

// Enhancement Configuration  
export const enhanceConfigSchema = z.object({
  resize: z.boolean().default(false),
  resizeMode: z.enum(["scale", "dimensions"]).default("scale"),
  scaleFactor: z.number().min(10).max(500).default(100),
  width: z.number().min(1).max(10000).optional(),
  height: z.number().min(1).max(10000).optional(),
  maintainAspectRatio: z.boolean().default(true),
  removeExif: z.boolean().default(true),
  addWatermark: z.boolean().default(false),
  watermarkText: z.string().optional(),
  watermarkPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).default("bottom-right"),
  watermarkImages: z.array(watermarkImageSchema).default([]),
  outputFormat: z.enum(["original", "jpeg", "png", "webp"]).default("original"),
  quality: z.number().min(1).max(100).default(90),
});

export type EnhanceConfig = z.infer<typeof enhanceConfigSchema>;

// WordPress Configuration
export const wordpressConfigSchema = z.object({
  siteUrl: z.string().url(),
  username: z.string().min(1),
  applicationPassword: z.string().min(1),
  armemberApiKey: z.string().optional(),
  postStatus: z.enum(["draft", "publish", "pending"]).default("draft"),
  postTitle: z.string().optional(),
  postContent: z.string().optional(),
  armemberPlanId: z.string().optional(),
  categories: z.array(z.number()).optional(),
  tags: z.array(z.number()).optional(),
});

export type WordPressConfig = z.infer<typeof wordpressConfigSchema>;

// Google Drive Configuration
export const driveConfigSchema = z.object({
  folderId: z.string().optional(),
  folderPath: z.string().optional(),
  createSubfolder: z.boolean().default(false),
  subfolderName: z.string().optional(),
});

export type DriveConfig = z.infer<typeof driveConfigSchema>;

// Full Workflow State
export const workflowStateSchema = z.object({
  id: z.string(),
  status: workflowStatusEnum,
  currentStep: z.number().min(1).max(5),
  uploadedZipName: z.string().optional(),
  images: z.array(processedImageSchema),
  renameConfig: renameConfigSchema.optional(),
  enhanceConfig: enhanceConfigSchema.optional(),
  driveConfig: driveConfigSchema.optional(),
  wordpressConfig: wordpressConfigSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
});

export type WorkflowState = z.infer<typeof workflowStateSchema>;

// API Request/Response types
export const uploadResponseSchema = z.object({
  workflowId: z.string(),
  images: z.array(processedImageSchema),
  message: z.string(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;

export const processRequestSchema = z.object({
  workflowId: z.string(),
  renameConfig: renameConfigSchema,
  enhanceConfig: enhanceConfigSchema,
});

export type ProcessRequest = z.infer<typeof processRequestSchema>;

// Description Template
export const descriptionTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  content: z.string(),
});

export type DescriptionTemplate = z.infer<typeof descriptionTemplateSchema>;

// Auto Mode Settings
export const autoModeSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  autoTitle: z.boolean().default(true),
  selectedTemplateId: z.string().optional(),
  skipRename: z.boolean().default(false),
  skipEnhance: z.boolean().default(false),
  skipExport: z.boolean().default(false),
  skipPublish: z.boolean().default(false),
  skipDeviantArt: z.boolean().default(false),
});

export type AutoModeSettings = z.infer<typeof autoModeSettingsSchema>;

export const publishRequestSchema = z.object({
  workflowId: z.string(),
  wordpressConfig: wordpressConfigSchema,
});

export type PublishRequest = z.infer<typeof publishRequestSchema>;

// ARMember Plan type
export const armemberPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export type ARMemberPlan = z.infer<typeof armemberPlanSchema>;

// DeviantArt OAuth Tokens
export const deviantartTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});

export type DeviantArtTokens = z.infer<typeof deviantartTokensSchema>;

// DeviantArt Scheduled Upload
export const scheduledUploadSchema = z.object({
  id: z.string(),
  imageUrl: z.string(), // Legacy: could be URL or imageId
  filePath: z.string().optional(), // Direct file path for persistence across restarts
  title: z.string(),
  description: z.string(),
  category: z.string(),
  isMature: z.boolean(),
  scheduledTime: z.string(),
  status: z.enum(["pending", "uploading", "published", "failed"]),
  publishedUrl: z.string().optional(),
  error: z.string().optional(),
});

export type ScheduledUpload = z.infer<typeof scheduledUploadSchema>;

// Discord Webhook Preset
export const discordWebhookSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  webhookUrl: z.string().url(),
  defaultMessage: z.string().optional(),
});

export type DiscordWebhook = z.infer<typeof discordWebhookSchema>;
export const insertDiscordWebhookSchema = discordWebhookSchema.omit({ id: true });
export type InsertDiscordWebhook = z.infer<typeof insertDiscordWebhookSchema>;
