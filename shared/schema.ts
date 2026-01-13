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

// Enhancement Configuration  
export const enhanceConfigSchema = z.object({
  resize: z.boolean().default(true),
  width: z.number().min(1).max(10000).optional(),
  height: z.number().min(1).max(10000).optional(),
  maintainAspectRatio: z.boolean().default(true),
  removeExif: z.boolean().default(true),
  addWatermark: z.boolean().default(false),
  watermarkText: z.string().optional(),
  watermarkPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).default("bottom-right"),
  outputFormat: z.enum(["original", "jpeg", "png", "webp"]).default("original"),
  quality: z.number().min(1).max(100).default(90),
});

export type EnhanceConfig = z.infer<typeof enhanceConfigSchema>;

// WordPress Configuration
export const wordpressConfigSchema = z.object({
  siteUrl: z.string().url(),
  username: z.string().min(1),
  applicationPassword: z.string().min(1),
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
