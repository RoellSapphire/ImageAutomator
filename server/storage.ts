import { type User, type InsertUser, type WorkflowState, type ProcessedImage, type RenameConfig, type EnhanceConfig, type DriveConfig, type WordPressConfig, type DescriptionTemplate, type AutoModeSettings } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface UserSettings {
  renameConfig?: RenameConfig;
  enhanceConfig?: EnhanceConfig;
  driveConfig?: DriveConfig;
  wordpressConfig?: Partial<WordPressConfig>;
  autoModeSettings?: AutoModeSettings;
  descriptionTemplates?: DescriptionTemplate[];
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createWorkflow(): Promise<WorkflowState>;
  getWorkflow(id: string): Promise<WorkflowState | undefined>;
  updateWorkflow(id: string, updates: Partial<WorkflowState>): Promise<WorkflowState | undefined>;
  addImages(workflowId: string, images: ProcessedImage[]): Promise<void>;
  updateImages(workflowId: string, images: ProcessedImage[]): Promise<void>;
  deleteWorkflow(id: string): Promise<void>;
  
  getUserSettings(): Promise<UserSettings>;
  saveUserSettings(settings: UserSettings): Promise<void>;
}

const SETTINGS_FILE = path.join(process.cwd(), "user-settings.json");

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private workflows: Map<string, WorkflowState>;

  constructor() {
    this.users = new Map();
    this.workflows = new Map();
  }

  async getUserSettings(): Promise<UserSettings> {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Failed to load user settings:", e);
    }
    return {};
  }

  async saveUserSettings(settings: UserSettings): Promise<void> {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.error("Failed to save user settings:", e);
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createWorkflow(): Promise<WorkflowState> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const workflow: WorkflowState = {
      id,
      status: "pending",
      currentStep: 1,
      images: [],
      createdAt: now,
      updatedAt: now,
    };
    this.workflows.set(id, workflow);
    return workflow;
  }

  async getWorkflow(id: string): Promise<WorkflowState | undefined> {
    return this.workflows.get(id);
  }

  async updateWorkflow(id: string, updates: Partial<WorkflowState>): Promise<WorkflowState | undefined> {
    const workflow = this.workflows.get(id);
    if (!workflow) return undefined;
    
    const updated: WorkflowState = {
      ...workflow,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async addImages(workflowId: string, images: ProcessedImage[]): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.images = [...workflow.images, ...images];
      workflow.updatedAt = new Date().toISOString();
      this.workflows.set(workflowId, workflow);
    }
  }

  async updateImages(workflowId: string, images: ProcessedImage[]): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.images = images;
      workflow.updatedAt = new Date().toISOString();
      this.workflows.set(workflowId, workflow);
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    this.workflows.delete(id);
  }
}

export const storage = new MemStorage();
