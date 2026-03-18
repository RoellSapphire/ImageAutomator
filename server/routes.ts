import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import AdmZip from "adm-zip";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { ProcessedImage, RenameConfig, EnhanceConfig, WordPressConfig, DriveConfig, WatermarkImage, FolderMapping, WorkflowPreset } from "@shared/schema";
import { checkDriveConnection, findOrCreateFolder, findOrCreateSubfolderById, uploadFileToDrive, listFolders, getAuthUrl, handleOAuthCallback, clearTokens } from "./google-drive";
import { getCivitaiUser, getGenerationFeed, downloadImage, deleteGeneratedImages, type GenerationFeedImage } from "./civitai";
import * as discord from "./discord";
import { getWatchedFolders, addWatchedFolder, updateWatchedFolder, removeWatchedFolder, startWatcher, stopWatcher, isWatcherRunning, getRecentEvents, resetFolder } from "./folder-watcher";
import { startAutoFetch, stopAutoFetch, getAutoFetchStatus, clearAutoFetchBuffer, forceProcessBuffer } from "./civitai-autofetch";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PROCESSED_DIR = path.join(process.cwd(), "processed");
const THUMBNAILS_DIR = path.join(process.cwd(), "thumbnails");
const WATERMARKS_DIR = path.join(process.cwd(), "watermarks");

[UPLOAD_DIR, PROCESSED_DIR, THUMBNAILS_DIR, WATERMARKS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

const uploadImages = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

const uploadWatermarks = multer({
  dest: WATERMARKS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.webp', '.gif'].includes(ext)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

async function createThumbnail(imagePath: string, thumbnailPath: string): Promise<void> {
  try {
    await sharp(imagePath)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
  } catch (error) {
    console.error('Error creating thumbnail:', error);
  }
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(imagePath).metadata();
    return { width: metadata.width || 0, height: metadata.height || 0 };
  } catch {
    return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get('/api/settings', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      res.json(settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      res.status(500).json({ message: 'Failed to load settings' });
    }
  });

  app.post('/api/settings', async (req: Request, res: Response) => {
    try {
      const settings = req.body;
      await storage.saveUserSettings(settings);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to save settings:', error);
      res.status(500).json({ message: 'Failed to save settings' });
    }
  });

  app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const workflow = await storage.createWorkflow();
      const workflowDir = path.join(UPLOAD_DIR, workflow.id);
      fs.mkdirSync(workflowDir, { recursive: true });

      const zip = new AdmZip(req.file.path);
      const zipEntries = zip.getEntries();
      
      const images: ProcessedImage[] = [];

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;
        
        const filename = path.basename(entry.entryName);
        if (!isImageFile(filename)) continue;

        const imageId = randomUUID();
        const originalPath = path.join(workflowDir, `${imageId}_${filename}`);
        const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);

        zip.extractEntryTo(entry, workflowDir, false, true, false, filename);
        const extractedPath = path.join(workflowDir, filename);
        
        if (fs.existsSync(extractedPath)) {
          fs.renameSync(extractedPath, originalPath);
          
          await createThumbnail(originalPath, thumbnailPath);
          const dimensions = await getImageDimensions(originalPath);
          const stats = fs.statSync(originalPath);

          images.push({
            id: imageId,
            originalName: filename,
            newName: filename,
            originalPath: originalPath,
            thumbnailPath: thumbnailPath,
            originalSize: stats.size,
            width: dimensions?.width,
            height: dimensions?.height,
            format: path.extname(filename).slice(1).toLowerCase(),
            status: "pending",
          });
        }
      }

      fs.unlinkSync(req.file.path);

      await storage.addImages(workflow.id, images);
      await storage.updateWorkflow(workflow.id, { uploadedZipName: req.file.originalname });

      res.json({
        workflowId: workflow.id,
        images,
        message: `Extracted ${images.length} images from ZIP file`,
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: 'Failed to process ZIP file' });
    }
  });

  app.post('/api/upload-folder', uploadImages.array('files', 100), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No image files uploaded' });
      }

      const workflow = await storage.createWorkflow();
      const workflowDir = path.join(UPLOAD_DIR, workflow.id);
      fs.mkdirSync(workflowDir, { recursive: true });

      const images: ProcessedImage[] = [];

      for (const file of files) {
        const filename = file.originalname;
        if (!isImageFile(filename)) continue;

        const imageId = randomUUID();
        const originalPath = path.join(workflowDir, `${imageId}_${filename}`);
        const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);

        fs.renameSync(file.path, originalPath);

        await createThumbnail(originalPath, thumbnailPath);
        const dimensions = await getImageDimensions(originalPath);
        const stats = fs.statSync(originalPath);

        images.push({
          id: imageId,
          originalName: filename,
          newName: filename,
          originalPath: originalPath,
          thumbnailPath: thumbnailPath,
          originalSize: stats.size,
          width: dimensions?.width,
          height: dimensions?.height,
          format: path.extname(filename).slice(1).toLowerCase(),
          status: "pending",
        });
      }

      await storage.addImages(workflow.id, images);
      await storage.updateWorkflow(workflow.id, { uploadedZipName: `${images.length} files from folder` });

      res.json({
        workflowId: workflow.id,
        images,
        message: `Uploaded ${images.length} images from folder`,
      });

    } catch (error) {
      console.error('Folder upload error:', error);
      res.status(500).json({ message: 'Failed to process uploaded files' });
    }
  });

  app.get('/api/thumbnail/:imageId', async (req: Request, res: Response) => {
    try {
      const { imageId } = req.params;
      const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);
      
      if (fs.existsSync(thumbnailPath)) {
        res.sendFile(thumbnailPath);
      } else {
        res.status(404).json({ message: 'Thumbnail not found' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Error serving thumbnail' });
    }
  });

  app.delete('/api/images/:workflowId/:imageId', async (req: Request, res: Response) => {
    try {
      const { workflowId, imageId } = req.params;
      const workflow = await storage.getWorkflow(workflowId);
      
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }
      
      const image = workflow.images.find(img => img.id === imageId);
      if (!image) {
        return res.status(404).json({ message: 'Image not found' });
      }
      
      if (image.originalPath && fs.existsSync(image.originalPath)) {
        fs.unlinkSync(image.originalPath);
      }
      
      const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
      
      const updatedImages = workflow.images.filter(img => img.id !== imageId);
      await storage.updateWorkflow(workflowId, { images: updatedImages });
      
      res.json({ success: true, remainingCount: updatedImages.length });
    } catch (error) {
      console.error('Error removing image:', error);
      res.status(500).json({ message: 'Failed to remove image' });
    }
  });

  app.post('/api/process', async (req: Request, res: Response) => {
    try {
      const { workflowId, renameConfig, enhanceConfig, skipRename, skipEnhance, deleteOriginalsAfterProcess } = req.body as {
        workflowId: string;
        renameConfig: RenameConfig;
        enhanceConfig: EnhanceConfig;
        skipRename?: boolean;
        skipEnhance?: boolean;
        deleteOriginalsAfterProcess?: boolean;
      };

      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }

      const processedDir = path.join(PROCESSED_DIR, workflowId);
      fs.mkdirSync(processedDir, { recursive: true });

      const processedImages: ProcessedImage[] = [];

      for (let i = 0; i < workflow.images.length; i++) {
        const image = workflow.images[i];
        
        try {
          let newName: string;
          if (skipRename) {
            newName = image.originalName;
          } else {
            const number = (renameConfig.startNumber + i).toString().padStart(renameConfig.padding, '0');
            const ext = enhanceConfig.outputFormat === 'original' 
              ? path.extname(image.originalName).slice(1)
              : enhanceConfig.outputFormat;
            newName = `${renameConfig.prefix}${renameConfig.separator}${number}.${ext}`;
          }
          const processedPath = path.join(processedDir, newName);

          if (skipEnhance) {
            fs.copyFileSync(image.originalPath, processedPath);
            const stats = fs.statSync(processedPath);
            const dimensions = await getImageDimensions(processedPath);

            processedImages.push({
              ...image,
              newName,
              processedPath,
              processedSize: stats.size,
              width: dimensions?.width,
              height: dimensions?.height,
              status: "completed",
            });
            continue;
          }

          let sharpInstance = sharp(image.originalPath);
          const metadata = await sharp(image.originalPath).metadata();
          const originalWidth = metadata.width || 800;
          const originalHeight = metadata.height || 600;

          if (enhanceConfig.resize) {
            const resizeMode = enhanceConfig.resizeMode || "scale";
            
            if (resizeMode === "scale" && enhanceConfig.scaleFactor) {
              const scale = enhanceConfig.scaleFactor / 100;
              const newWidth = Math.round(originalWidth * scale);
              const newHeight = Math.round(originalHeight * scale);
              sharpInstance = sharpInstance.resize({
                width: newWidth,
                height: newHeight,
                fit: 'fill',
              });
            } else if (resizeMode === "dimensions" && (enhanceConfig.width || enhanceConfig.height)) {
              sharpInstance = sharpInstance.resize({
                width: enhanceConfig.width,
                height: enhanceConfig.height,
                fit: enhanceConfig.maintainAspectRatio ? 'inside' : 'fill',
              });
            }
          }

          if (enhanceConfig.removeExif) {
            sharpInstance = sharpInstance.rotate();
          }

          if (enhanceConfig.addWatermark) {
            const compositeInputs: { input: Buffer; gravity?: string; top?: number; left?: number; tile?: boolean }[] = [];

            for (const watermark of (enhanceConfig.watermarkImages || [])) {
              if (!fs.existsSync(watermark.path)) continue;

              try {
                const watermarkImage = sharp(watermark.path);
                const watermarkMeta = await watermarkImage.metadata();
                const watermarkWidth = watermarkMeta.width || 100;
                const watermarkHeight = watermarkMeta.height || 100;

                const scaledWidth = Math.round((originalWidth * watermark.scale) / 100);
                const scaledHeight = Math.round((watermarkHeight / watermarkWidth) * scaledWidth);

                let watermarkBuffer = await watermarkImage
                  .resize(scaledWidth, scaledHeight)
                  .ensureAlpha()
                  .modulate({ brightness: 1 })
                  .composite([{
                    input: Buffer.from([0, 0, 0, Math.round(255 * (watermark.opacity / 100))]),
                    raw: { width: 1, height: 1, channels: 4 },
                    tile: true,
                    blend: 'dest-in'
                  }])
                  .toBuffer();

                if (watermark.position === "tile") {
                  compositeInputs.push({
                    input: watermarkBuffer,
                    tile: true,
                  });
                } else {
                  let gravity: string;
                  switch (watermark.position) {
                    case "top-left": gravity = "northwest"; break;
                    case "top-right": gravity = "northeast"; break;
                    case "bottom-left": gravity = "southwest"; break;
                    case "bottom-right": gravity = "southeast"; break;
                    case "center": gravity = "center"; break;
                    default: gravity = "southeast";
                  }
                  compositeInputs.push({
                    input: watermarkBuffer,
                    gravity,
                  });
                }
              } catch (watermarkError) {
                console.error('Error applying watermark:', watermarkError);
              }
            }

            if (compositeInputs.length > 0) {
              sharpInstance = sharpInstance.composite(compositeInputs as any);
            }
          }

          switch (enhanceConfig.outputFormat) {
            case 'jpeg':
              sharpInstance = sharpInstance.jpeg({ quality: enhanceConfig.quality });
              break;
            case 'png':
              sharpInstance = sharpInstance.png({ quality: enhanceConfig.quality });
              break;
            case 'webp':
              sharpInstance = sharpInstance.webp({ quality: enhanceConfig.quality });
              break;
          }

          await sharpInstance.toFile(processedPath);

          const stats = fs.statSync(processedPath);
          const dimensions = await getImageDimensions(processedPath);

          processedImages.push({
            ...image,
            newName,
            processedPath,
            processedSize: stats.size,
            width: dimensions?.width,
            height: dimensions?.height,
            status: "completed",
          });

        } catch (error) {
          console.error(`Error processing ${image.originalName}:`, error);
          processedImages.push({
            ...image,
            status: "error",
            error: `Failed to process: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      await storage.updateImages(workflowId, processedImages);
      await storage.updateWorkflow(workflowId, { 
        renameConfig, 
        enhanceConfig,
        currentStep: 4,
      });

      // Delete original files if enabled and ALL images were successfully processed
      let deletedCount = 0;
      let deletionSkipped = false;
      const successCount = processedImages.filter(i => i.status === 'completed').length;
      const allSuccessful = successCount === processedImages.length;
      
      if (deleteOriginalsAfterProcess) {
        if (allSuccessful) {
          for (const image of processedImages) {
            try {
              if (image.originalPath && fs.existsSync(image.originalPath)) {
                fs.unlinkSync(image.originalPath);
                deletedCount++;
              }
            } catch (err) {
              console.error(`Failed to delete original: ${image.originalPath}`, err);
            }
          }
          // Try to remove the uploads folder if empty
          const uploadsDir = path.join(UPLOAD_DIR, workflowId);
          try {
            const remaining = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
            if (remaining.length === 0) {
              fs.rmdirSync(uploadsDir);
            }
          } catch (err) {
            // Ignore - folder may not be empty or already deleted
          }
        } else {
          deletionSkipped = true;
          console.log(`Skipping original deletion: only ${successCount}/${processedImages.length} images processed successfully`);
        }
      }

      let message = `Processed ${successCount} images`;
      if (deletedCount > 0) {
        message += `, deleted ${deletedCount} originals`;
      } else if (deletionSkipped) {
        message += ` (originals kept due to partial failures)`;
      }

      res.json({
        images: processedImages,
        message,
      });

    } catch (error) {
      console.error('Process error:', error);
      res.status(500).json({ message: 'Failed to process images' });
    }
  });

  app.get('/api/download/:workflowId', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const workflow = await storage.getWorkflow(workflowId);
      
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }

      const zip = new AdmZip();
      
      for (const image of workflow.images) {
        if (image.processedPath && fs.existsSync(image.processedPath)) {
          zip.addLocalFile(image.processedPath, '', image.newName);
        }
      }

      const zipBuffer = zip.toBuffer();
      const filename = `processed_images_${workflowId.slice(0, 8)}.zip`;
      
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length,
      });
      
      res.send(zipBuffer);

    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ message: 'Failed to create download' });
    }
  });

  // Google Drive endpoints
  app.get('/api/drive/status', async (req: Request, res: Response) => {
    try {
      const status = await checkDriveConnection();
      res.json({ connected: status.connected, email: status.email });
    } catch (error) {
      res.json({ connected: false });
    }
  });

  app.get('/api/drive/oauth/start', async (req: Request, res: Response) => {
    try {
      const authUrl = getAuthUrl();
      res.redirect(authUrl);
    } catch (error) {
      console.error('OAuth start error:', error);
      res.status(500).json({ message: 'Failed to start OAuth flow' });
    }
  });

  app.get('/api/drive/oauth/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      if (!code) {
        return res.status(400).send('Authorization code missing');
      }
      await handleOAuthCallback(code);
      res.send(`
        <html>
          <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e; color: white;">
            <div style="text-align: center;">
              <h1>Google Drive Connected!</h1>
              <p>You can close this window and return to the app.</p>
              <script>setTimeout(() => window.close(), 2000);</script>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.status(500).send('Failed to complete authorization');
    }
  });

  app.post('/api/drive/disconnect', async (req: Request, res: Response) => {
    try {
      clearTokens();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Failed to disconnect' });
    }
  });

  app.post('/api/drive/export', async (req: Request, res: Response) => {
    try {
      const { workflowId, driveConfig } = req.body as {
        workflowId: string;
        driveConfig: DriveConfig;
      };

      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }

      let targetFolderId: string;

      if (driveConfig.folderId) {
        console.log(`[Drive Export] Using selected folder ID: ${driveConfig.folderId}`);
        targetFolderId = driveConfig.folderId;
        
        if (driveConfig.createSubfolder && driveConfig.subfolderName && driveConfig.subfolderName.trim()) {
          const subfolderName = driveConfig.subfolderName.trim();
          console.log(`[Drive Export] Creating/finding subfolder: ${subfolderName} in folder ${targetFolderId}`);
          targetFolderId = await findOrCreateSubfolderById(targetFolderId, subfolderName);
          console.log(`[Drive Export] Subfolder ID: ${targetFolderId}`);
        }
      } else {
        let folderPath = driveConfig.folderPath || '/Civitai Images';
        if (driveConfig.createSubfolder && driveConfig.subfolderName) {
          folderPath = `${folderPath}/${driveConfig.subfolderName}`;
        }
        console.log(`[Drive Export] No folder ID provided, using path: ${folderPath}`);
        targetFolderId = await findOrCreateFolder(folderPath);
      }

      console.log(`[Drive Export] Final target folder ID: ${targetFolderId}`);
      const uploadedFiles: { name: string; id: string; link: string }[] = [];

      for (const image of workflow.images) {
        const imagePath = image.processedPath || image.originalPath;
        if (!imagePath || !fs.existsSync(imagePath)) continue;

        const ext = path.extname(image.newName).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' :
                        ext === '.webp' ? 'image/webp' :
                        ext === '.gif' ? 'image/gif' :
                        'image/jpeg';

        try {
          console.log(`[Drive Export] Uploading ${image.newName} to folder ${targetFolderId}`);
          const result = await uploadFileToDrive(imagePath, image.newName, mimeType, targetFolderId);
          uploadedFiles.push({
            name: image.newName,
            id: result.id,
            link: result.webViewLink,
          });
          console.log(`[Drive Export] Successfully uploaded ${image.newName}, file ID: ${result.id}`);
        } catch (uploadError) {
          console.error(`[Drive Export] Failed to upload ${image.newName}:`, uploadError);
        }
      }

      await storage.updateWorkflow(workflowId, {
        driveConfig,
        currentStep: 5,
      });

      res.json({
        success: true,
        uploadedCount: uploadedFiles.length,
        totalCount: workflow.images.length,
        files: uploadedFiles,
        message: `Uploaded ${uploadedFiles.length} files to Google Drive`,
      });

    } catch (error) {
      console.error('Drive export error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to export to Google Drive';
      const statusCode = errorMessage.includes('not connected') ? 503 : 500;
      res.status(statusCode).json({ 
        message: errorMessage,
        hint: statusCode === 503 ? 'Please connect Google Drive in Replit settings' : undefined
      });
    }
  });

  app.post('/api/wordpress/verify', async (req: Request, res: Response) => {
    try {
      const { siteUrl, username, applicationPassword, armemberApiKey } = req.body;

      const auth = Buffer.from(`${username}:${applicationPassword}`).toString('base64');
      
      const response = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      if (!response.ok) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const user = await response.json();

      let armemberPlans: { id: string; name: string; description?: string }[] = [];
      
      if (armemberApiKey) {
        try {
          const armemberUrl = `${siteUrl}/wp-json/armember/v1/arm_memberships?arm_api_key=${armemberApiKey}`;
          console.log('Fetching ARMember plans from:', armemberUrl);
          
          const plansResponse = await fetch(armemberUrl);
          console.log('ARMember response status:', plansResponse.status);
          
          if (plansResponse.ok) {
            const plansData = await plansResponse.json();
            console.log('ARMember raw response:', JSON.stringify(plansData, null, 2));
            
            if (plansData && typeof plansData === 'object') {
              let plansArray: any[] = [];
              
              if (Array.isArray(plansData)) {
                plansArray = plansData;
              } else if (plansData.response?.result && Array.isArray(plansData.response.result)) {
                plansArray = plansData.response.result;
              } else if (plansData.data && Array.isArray(plansData.data)) {
                plansArray = plansData.data;
              } else if (plansData.memberships && Array.isArray(plansData.memberships)) {
                plansArray = plansData.memberships;
              } else if (plansData.plans && Array.isArray(plansData.plans)) {
                plansArray = plansData.plans;
              } else if (plansData.result && Array.isArray(plansData.result)) {
                plansArray = plansData.result;
              } else {
                const values = Object.values(plansData);
                if (values.length > 0 && typeof values[0] === 'object') {
                  plansArray = values as any[];
                }
              }
              
              console.log('Parsed plans array:', JSON.stringify(plansArray, null, 2));
              
              if (plansArray.length > 0) {
                armemberPlans = plansArray.map((plan: any) => ({
                  id: String(plan.arm_subscription_plan_id || plan.id || plan.plan_id),
                  name: plan.arm_subscription_plan_name || plan.name || plan.plan_name || 'Unknown Plan',
                  description: plan.arm_subscription_plan_description || plan.description,
                }));
              }
            }
          } else {
            const errorText = await plansResponse.text();
            console.log('ARMember error response:', errorText);
          }
        } catch (planError) {
          console.log('ARMember plans not available:', planError);
        }
      }

      if (armemberPlans.length === 0) {
        armemberPlans = [
          { id: "1", name: "Free Member" },
          { id: "2", name: "Premium Member" },
          { id: "3", name: "VIP Member" },
        ];
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        armemberPlans,
      });

    } catch (error) {
      console.error('WordPress verify error:', error);
      res.status(500).json({ message: 'Failed to connect to WordPress' });
    }
  });

  app.post('/api/publish', async (req: Request, res: Response) => {
    try {
      const { workflowId, wordpressConfig } = req.body as {
        workflowId: string;
        wordpressConfig: WordPressConfig;
      };

      const workflow = await storage.getWorkflow(workflowId);
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }

      const auth = Buffer.from(`${wordpressConfig.username}:${wordpressConfig.applicationPassword}`).toString('base64');

      const uploadedMedia: { id: number; url: string }[] = [];
      
      for (const image of workflow.images) {
        const imagePath = image.processedPath || image.originalPath;
        if (!imagePath || !fs.existsSync(imagePath)) continue;

        const imageBuffer = fs.readFileSync(imagePath);
        const mimeType = image.format === 'png' ? 'image/png' : 
                        image.format === 'webp' ? 'image/webp' : 
                        'image/jpeg';

        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: mimeType });
        formData.append('file', blob, image.newName);

        try {
          const uploadResponse = await fetch(`${wordpressConfig.siteUrl}/wp-json/wp/v2/media`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Disposition': `attachment; filename="${image.newName}"`,
            },
            body: formData,
          });

          if (uploadResponse.ok) {
            const mediaData = await uploadResponse.json();
            uploadedMedia.push({
              id: mediaData.id,
              url: mediaData.source_url || mediaData.guid?.rendered || '',
            });
          } else {
            console.error(`Failed to upload ${image.newName}: ${uploadResponse.status}`);
          }
        } catch (uploadError) {
          console.error(`Failed to upload ${image.newName}:`, uploadError);
        }
      }

      let postContent = wordpressConfig.postContent || '';
      
      if (uploadedMedia.length > 0) {
        const mediaIds = uploadedMedia.map(m => m.id);
        const galleryBlock = `<!-- wp:gallery {"ids":[${mediaIds.join(',')}],"columns":3,"linkTo":"none"} -->
<figure class="wp-block-gallery has-nested-images columns-3 is-cropped">
${uploadedMedia.map(m => `<!-- wp:image {"id":${m.id},"sizeSlug":"large"} --><figure class="wp-block-image size-large"><img src="${m.url}" alt="" class="wp-image-${m.id}"/></figure><!-- /wp:image -->`).join('\n')}
</figure>
<!-- /wp:gallery -->`;
        
        postContent = postContent + '\n\n' + galleryBlock;
      }

      const postData: any = {
        title: wordpressConfig.postTitle || 'Civitai Images',
        content: postContent,
        status: wordpressConfig.postStatus,
      };

      if (uploadedMedia.length > 0) {
        postData.featured_media = uploadedMedia[0].id;
      }

      if (wordpressConfig.categories && wordpressConfig.categories.length > 0) {
        postData.categories = wordpressConfig.categories;
      }

      if (wordpressConfig.tags && wordpressConfig.tags.length > 0) {
        postData.tags = wordpressConfig.tags;
      }

      const postResponse = await fetch(`${wordpressConfig.siteUrl}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });

      if (!postResponse.ok) {
        const errorData = await postResponse.json();
        return res.status(postResponse.status).json({ 
          message: errorData.message || 'Failed to create post' 
        });
      }

      const post = await postResponse.json();

      if (wordpressConfig.armemberPlanId) {
        try {
          // ARMember uses post meta 'arm_access_plan' as an array of plan IDs
          // And 'arm_item_protection' set to 1 to enable restriction
          const planIds = wordpressConfig.armemberPlanId.split(',').map((id: string) => id.trim());
          
          console.log('Applying ARMember restriction for post', post.id, 'with plans:', planIds);
          
          // First try: Update post meta directly using correct ARMember meta keys
          const metaResponse = await fetch(`${wordpressConfig.siteUrl}/wp-json/wp/v2/posts/${post.id}`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              meta: {
                'arm_access_plan': planIds,
                'arm_item_protection': 1,
              },
            }),
          });
          
          const metaResponseText = await metaResponse.text();
          console.log('ARMember meta update response:', metaResponse.status, metaResponseText.substring(0, 200));
          
          if (!metaResponse.ok) {
            console.log('ARMember meta update via post failed, trying alternative...');
            
            // Try alternative: Use the ARMember API endpoint if available
            const armemberApiKey = wordpressConfig.armemberApiKey;
            if (armemberApiKey) {
              const armUrl = `${wordpressConfig.siteUrl}/wp-json/armember/v1/arm_restrict_post?arm_api_key=${armemberApiKey}`;
              const armResponse = await fetch(armUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  post_id: post.id,
                  plan_ids: planIds,
                }),
              });
              const armText = await armResponse.text();
              console.log('ARMember API restrict response:', armResponse.status, armText.substring(0, 200));
            }
          } else {
            console.log('ARMember restriction applied via post meta for plans:', planIds);
          }
        } catch (restrictError) {
          console.log('ARMember restriction not set:', restrictError);
        }
      }

      await storage.updateWorkflow(workflowId, {
        wordpressConfig,
        currentStep: 5,
        status: "completed",
      });

      res.json({
        success: true,
        postId: post.id,
        postUrl: post.link,
        message: 'Post published successfully',
      });

    } catch (error) {
      console.error('Publish error:', error);
      res.status(500).json({ message: 'Failed to publish to WordPress' });
    }
  });

  app.get('/api/workflow/:workflowId', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const workflow = await storage.getWorkflow(workflowId);
      
      if (!workflow) {
        return res.status(404).json({ message: 'Workflow not found' });
      }

      res.json(workflow);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching workflow' });
    }
  });

  app.post('/api/watermarks/upload', uploadWatermarks.array('watermarks', 3), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No watermark files uploaded' });
      }

      const watermarks: WatermarkImage[] = [];

      for (const file of files) {
        const watermarkId = randomUUID();
        const ext = path.extname(file.originalname).toLowerCase();
        const newPath = path.join(WATERMARKS_DIR, `${watermarkId}${ext}`);
        
        fs.renameSync(file.path, newPath);

        watermarks.push({
          id: watermarkId,
          name: file.originalname,
          path: newPath,
          opacity: 50,
          position: "bottom-right",
          scale: 20,
        });
      }

      res.json({ watermarks });
    } catch (error) {
      console.error('Watermark upload error:', error);
      res.status(500).json({ message: 'Failed to upload watermarks' });
    }
  });

  app.get('/api/watermarks/:watermarkId', async (req: Request, res: Response) => {
    try {
      const { watermarkId } = req.params;
      const possiblePaths = [
        path.join(WATERMARKS_DIR, `${watermarkId}.png`),
        path.join(WATERMARKS_DIR, `${watermarkId}.webp`),
        path.join(WATERMARKS_DIR, `${watermarkId}.gif`),
      ];
      
      for (const watermarkPath of possiblePaths) {
        if (fs.existsSync(watermarkPath)) {
          return res.sendFile(watermarkPath);
        }
      }
      
      res.status(404).json({ message: 'Watermark not found' });
    } catch (error) {
      res.status(500).json({ message: 'Error serving watermark' });
    }
  });

  app.get('/api/drive/folders', async (req: Request, res: Response) => {
    try {
      const parentId = req.query.parentId as string | undefined;
      const folders = await listFolders(parentId);
      res.json({ folders });
    } catch (error) {
      console.error('Drive folders error:', error);
      res.status(500).json({ message: 'Failed to list folders', folders: [] });
    }
  });

  // Discord API endpoints
  app.get('/api/discord/status', async (req: Request, res: Response) => {
    try {
      const status = await discord.checkDiscordConnection();
      res.json(status);
    } catch (error: any) {
      console.error('Discord status error:', error);
      res.json({ connected: false, error: error.message });
    }
  });

  app.get('/api/discord/guilds', async (req: Request, res: Response) => {
    try {
      const guilds = await discord.getDiscordGuilds();
      res.json({ guilds });
    } catch (error: any) {
      console.error('Discord guilds error:', error);
      res.status(500).json({ message: error.message, guilds: [] });
    }
  });

  app.get('/api/discord/channels/:guildId', async (req: Request, res: Response) => {
    try {
      const { guildId } = req.params;
      const channels = await discord.getDiscordChannels(guildId);
      res.json({ channels });
    } catch (error: any) {
      console.error('Discord channels error:', error);
      res.status(500).json({ message: error.message, channels: [] });
    }
  });

  app.post('/api/discord/post', async (req: Request, res: Response) => {
    try {
      const { channelId, message, workflowId, imageIds } = req.body;
      
      if (!channelId) {
        return res.status(400).json({ message: 'Channel ID is required' });
      }
      
      if (!workflowId && (!imageIds || imageIds.length === 0)) {
        return res.status(400).json({ message: 'Workflow ID or image IDs are required' });
      }
      
      // Get images from workflow or by IDs
      let images: ProcessedImage[] = [];
      if (workflowId) {
        const workflow = await storage.getWorkflow(workflowId);
        if (!workflow) {
          return res.status(404).json({ message: 'Workflow not found' });
        }
        images = (workflow as any).processedImages || workflow.images || [];
      } else if (imageIds) {
        for (const id of imageIds) {
          const img = await storage.findImageById(id);
          if (img) images.push(img);
        }
      }
      
      if (images.length === 0) {
        return res.status(400).json({ message: 'No images found to post' });
      }
      
      // Read image buffers
      const imageBuffers: { buffer: Buffer; filename: string }[] = [];
      for (const img of images) {
        const imgPath = img.processedPath || img.originalPath;
        if (fs.existsSync(imgPath)) {
          const buffer = fs.readFileSync(imgPath);
          imageBuffers.push({
            buffer,
            filename: path.basename(imgPath)
          });
        }
      }
      
      if (imageBuffers.length === 0) {
        return res.status(400).json({ message: 'No valid image files found' });
      }
      
      const result = await discord.postToDiscord(channelId, message || '', imageBuffers);
      
      if (result.success) {
        res.json({ success: true, messageId: result.messageId, count: imageBuffers.length });
      } else {
        res.status(500).json({ success: false, message: result.error });
      }
    } catch (error: any) {
      console.error('Discord post error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/discord/webhook', async (req: Request, res: Response) => {
    try {
      const { webhookUrl, message, workflowId, imageIds } = req.body;
      
      if (!webhookUrl) {
        return res.status(400).json({ message: 'Webhook URL is required' });
      }
      
      if (!workflowId && (!imageIds || imageIds.length === 0)) {
        return res.status(400).json({ message: 'Workflow ID or image IDs are required' });
      }
      
      // Get images from workflow or by IDs
      let images: ProcessedImage[] = [];
      if (workflowId) {
        const workflow = await storage.getWorkflow(workflowId);
        if (!workflow) {
          return res.status(404).json({ message: 'Workflow not found' });
        }
        images = (workflow as any).processedImages || workflow.images || [];
      } else if (imageIds) {
        for (const id of imageIds) {
          const img = await storage.findImageById(id);
          if (img) images.push(img);
        }
      }
      
      if (images.length === 0) {
        return res.status(400).json({ message: 'No images found to post' });
      }
      
      // Read image buffers
      const imageBuffers: { buffer: Buffer; filename: string }[] = [];
      for (const img of images) {
        const imgPath = img.processedPath || img.originalPath;
        if (fs.existsSync(imgPath)) {
          const buffer = fs.readFileSync(imgPath);
          imageBuffers.push({
            buffer,
            filename: path.basename(imgPath)
          });
        }
      }
      
      if (imageBuffers.length === 0) {
        return res.status(400).json({ message: 'No valid image files found' });
      }
      
      // Auto-batch: Discord limits 10 files per message
      const BATCH_SIZE = 10;
      let successCount = 0;
      let failCount = 0;
      const errors: string[] = [];
      
      for (let i = 0; i < imageBuffers.length; i += BATCH_SIZE) {
        const batch = imageBuffers.slice(i, i + BATCH_SIZE);
        // Only include message on the first batch
        const batchMessage = i === 0 ? (message || '') : '';
        
        const result = await discord.postToWebhook(webhookUrl, batchMessage, batch);
        
        if (result.success) {
          successCount += batch.length;
        } else {
          failCount += batch.length;
          if (result.error) errors.push(result.error);
        }
        
        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < imageBuffers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      const totalMessages = Math.ceil(imageBuffers.length / BATCH_SIZE);
      
      if (failCount === 0) {
        res.json({ 
          success: true, 
          count: successCount, 
          messages: totalMessages,
          note: totalMessages > 1 ? `Posted in ${totalMessages} messages (Discord 10 image limit)` : undefined
        });
      } else if (successCount > 0) {
        res.json({ 
          success: true, 
          count: successCount, 
          failed: failCount,
          messages: totalMessages,
          note: `${successCount} images posted, ${failCount} failed`
        });
      } else {
        res.status(500).json({ success: false, message: errors[0] || 'Failed to post images' });
      }
    } catch (error: any) {
      console.error('Discord webhook error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Discord Webhook CRUD endpoints
  app.get('/api/discord/webhooks', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      res.json(settings.discordWebhooks || []);
    } catch (error: any) {
      console.error('Get webhooks error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/discord/webhooks', async (req: Request, res: Response) => {
    try {
      const { name, webhookUrl, defaultMessage } = req.body;
      
      if (!name || !webhookUrl) {
        return res.status(400).json({ message: 'Name and webhook URL are required' });
      }
      
      if (!webhookUrl.includes('discord.com/api/webhooks/')) {
        return res.status(400).json({ message: 'Invalid Discord webhook URL' });
      }
      
      const settings = await storage.getUserSettings();
      const webhooks = settings.discordWebhooks || [];
      
      const newWebhook = {
        id: randomUUID(),
        name,
        webhookUrl,
        defaultMessage: defaultMessage || undefined
      };
      
      webhooks.push(newWebhook);
      await storage.saveUserSettings({ ...settings, discordWebhooks: webhooks });
      
      res.json(newWebhook);
    } catch (error: any) {
      console.error('Create webhook error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put('/api/discord/webhooks/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, webhookUrl, defaultMessage } = req.body;
      
      const settings = await storage.getUserSettings();
      const webhooks = settings.discordWebhooks || [];
      
      const index = webhooks.findIndex(w => w.id === id);
      if (index === -1) {
        return res.status(404).json({ message: 'Webhook not found' });
      }
      
      webhooks[index] = {
        ...webhooks[index],
        name: name || webhooks[index].name,
        webhookUrl: webhookUrl || webhooks[index].webhookUrl,
        defaultMessage: defaultMessage !== undefined ? defaultMessage : webhooks[index].defaultMessage
      };
      
      await storage.saveUserSettings({ ...settings, discordWebhooks: webhooks });
      res.json(webhooks[index]);
    } catch (error: any) {
      console.error('Update webhook error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete('/api/discord/webhooks/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const settings = await storage.getUserSettings();
      const webhooks = settings.discordWebhooks || [];
      
      const index = webhooks.findIndex(w => w.id === id);
      if (index === -1) {
        return res.status(404).json({ message: 'Webhook not found' });
      }
      
      webhooks.splice(index, 1);
      await storage.saveUserSettings({ ...settings, discordWebhooks: webhooks });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete webhook error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Workflow Presets CRUD
  app.get('/api/presets', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      res.json(settings.workflowPresets || []);
    } catch (error: any) {
      console.error('Get presets error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/presets', async (req: Request, res: Response) => {
    try {
      const { name, discordWebhookId, postTitle, postDescription, driveSubfolderName, renamePrefix, descriptionTemplateId } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }

      const settings = await storage.getUserSettings();
      const presets = settings.workflowPresets || [];

      const newPreset: WorkflowPreset = {
        id: randomUUID(),
        name,
        discordWebhookId: discordWebhookId || undefined,
        postTitle: postTitle || undefined,
        postDescription: postDescription || undefined,
        driveSubfolderName: driveSubfolderName || undefined,
        renamePrefix: renamePrefix || undefined,
        descriptionTemplateId: descriptionTemplateId || undefined,
      };

      presets.push(newPreset);
      await storage.saveUserSettings({ ...settings, workflowPresets: presets });

      res.json(newPreset);
    } catch (error: any) {
      console.error('Create preset error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.put('/api/presets/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, discordWebhookId, postTitle, postDescription, driveSubfolderName, renamePrefix, descriptionTemplateId } = req.body;

      const settings = await storage.getUserSettings();
      const presets = settings.workflowPresets || [];

      const index = presets.findIndex((p: WorkflowPreset) => p.id === id);
      if (index === -1) {
        return res.status(404).json({ message: 'Preset not found' });
      }

      presets[index] = {
        ...presets[index],
        name: name !== undefined ? name : presets[index].name,
        discordWebhookId: discordWebhookId !== undefined ? discordWebhookId : presets[index].discordWebhookId,
        postTitle: postTitle !== undefined ? postTitle : presets[index].postTitle,
        postDescription: postDescription !== undefined ? postDescription : presets[index].postDescription,
        driveSubfolderName: driveSubfolderName !== undefined ? driveSubfolderName : presets[index].driveSubfolderName,
        renamePrefix: renamePrefix !== undefined ? renamePrefix : presets[index].renamePrefix,
        descriptionTemplateId: descriptionTemplateId !== undefined ? descriptionTemplateId : presets[index].descriptionTemplateId,
      };

      await storage.saveUserSettings({ ...settings, workflowPresets: presets });
      res.json(presets[index]);
    } catch (error: any) {
      console.error('Update preset error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.delete('/api/presets/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const settings = await storage.getUserSettings();
      const presets = settings.workflowPresets || [];

      const index = presets.findIndex((p: WorkflowPreset) => p.id === id);
      if (index === -1) {
        return res.status(404).json({ message: 'Preset not found' });
      }

      presets.splice(index, 1);
      await storage.saveUserSettings({ ...settings, workflowPresets: presets });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete preset error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Civitai API endpoints
  app.get('/api/civitai/status', async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.CIVITAI_API_KEY;
      if (!apiKey) {
        return res.json({ connected: false, message: 'No API key configured' });
      }

      const user = await getCivitaiUser(apiKey);
      if (user) {
        res.json({ connected: true, username: user.username, userId: user.id });
      } else {
        res.json({ connected: false, message: 'Invalid API key or connection failed' });
      }
    } catch (error) {
      console.error('Civitai status error:', error);
      res.status(500).json({ connected: false, message: 'Failed to check Civitai status' });
    }
  });

  app.get('/api/civitai/images', async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.CIVITAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ message: 'No Civitai API key configured' });
      }

      const user = await getCivitaiUser(apiKey);
      if (!user) {
        return res.status(401).json({ message: 'Failed to authenticate with Civitai' });
      }

      const cursor = req.query.cursor as string | undefined;
      const take = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const sort = (req.query.sort as 'Newest' | 'Oldest') || 'Newest';

      const response = await getGenerationFeed(apiKey, {
        cursor,
        take,
        sort,
      });

      // Transform generation feed items to a consistent format
      // Each item may have multiple images in steps[].images[] (e.g., batch of 8)
      const images = response.items.flatMap(item => {
        // Get ALL available images from all steps
        const allImages: Array<{ url: string; stepIndex: number; imageIndex: number }> = [];
        
        item.steps?.forEach((step, stepIndex) => {
          step.images?.forEach((img, imageIndex) => {
            if (img.available && img.url) {
              allImages.push({ url: img.url, stepIndex, imageIndex });
            }
          });
        });
        
        // Return an image object for each available image in the batch
        return allImages.map((imgData, idx) => ({
          id: `${item.id}_${imgData.stepIndex}_${imgData.imageIndex}`,
          batchId: item.id, // Keep track of which batch this belongs to for deletion
          url: imgData.url,
          width: item.params?.width || 0,
          height: item.params?.height || 0,
          createdAt: item.createdAt,
          meta: {
            prompt: item.params?.prompt,
            negativePrompt: item.params?.negativePrompt,
            seed: item.params?.seed,
            steps: item.params?.steps,
            sampler: item.params?.sampler,
            cfgScale: item.params?.cfgScale,
          },
        }));
      });

      res.json({
        images,
        metadata: { nextCursor: response.nextCursor },
        username: user.username,
      });
    } catch (error) {
      console.error('Civitai images error:', error);
      res.status(500).json({ message: 'Failed to fetch Civitai images' });
    }
  });

  app.post('/api/civitai/import', async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.CIVITAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ message: 'No Civitai API key configured' });
      }

      // Accept image URLs directly from the frontend
      const { imageUrls, deleteAfterImport } = req.body as { 
        imageUrls: Array<{ url: string; width: number; height: number; id: string; batchId?: string }>;
        deleteAfterImport?: boolean;
      };
      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ message: 'No images provided' });
      }

      // Create a workflow for the import
      const workflow = await storage.createWorkflow();
      const workflowDir = path.join(UPLOAD_DIR, workflow.id);
      fs.mkdirSync(workflowDir, { recursive: true });

      const images: ProcessedImage[] = [];

      for (const imageData of imageUrls) {
        try {
          const imageBuffer = await downloadImage(imageData.url);
          const imageId = randomUUID();
          const ext = '.jpg'; // Civitai images are typically JPEG
          const imagePath = path.join(workflowDir, `${imageId}${ext}`);
          
          fs.writeFileSync(imagePath, imageBuffer);

          // Create thumbnail
          const thumbnailPath = path.join(THUMBNAILS_DIR, `${imageId}.jpg`);
          await createThumbnail(imagePath, thumbnailPath);

          // Get dimensions
          const dimensions = await getImageDimensions(imagePath);

          images.push({
            id: imageId,
            originalName: `civitai_${imageData.id}${ext}`,
            newName: `civitai_${imageData.id}${ext}`,
            originalPath: imagePath,
            originalSize: imageBuffer.length,
            width: dimensions?.width || imageData.width,
            height: dimensions?.height || imageData.height,
            format: 'jpeg',
            status: 'pending',
          });
        } catch (error) {
          console.error(`Failed to download image ${imageData.id}:`, error);
        }
      }

      if (images.length === 0) {
        return res.status(500).json({ message: 'Failed to download any images' });
      }

      await storage.updateWorkflow(workflow.id, { images });

      // Delete images from Civitai if requested
      // Use batchId (the original workflow ID) for deletion, deduplicated
      let deleteResult = null;
      if (deleteAfterImport && images.length > 0) {
        // Get unique batch IDs (multiple images may share the same batch)
        // For compound IDs like "workflowId_stepIndex_imageIndex", extract workflowId
        const batchIds = new Set(imageUrls.map(img => {
          if (img.batchId) return img.batchId;
          // Extract the original workflow ID from compound ID
          const parts = img.id.split('_');
          // If it looks like a compound ID (has underscores), get everything before last 2 parts
          if (parts.length >= 3) {
            // Rejoin all parts except last 2 (stepIndex and imageIndex)
            return parts.slice(0, -2).join('_');
          }
          return img.id;
        }));
        const idsToDelete = Array.from(batchIds);
        console.log(`Deleting ${idsToDelete.length} batch(es) from Civitai:`, idsToDelete);
        deleteResult = await deleteGeneratedImages(apiKey, idsToDelete);
        console.log(`Delete result: ${deleteResult.deleted} deleted, ${deleteResult.errors.length} errors`);
        if (deleteResult.errors.length > 0) {
          console.log('Delete errors:', deleteResult.errors);
        }
      }

      res.json({
        workflowId: workflow.id,
        images,
        imported: images.length,
        total: imageUrls.length,
        deleted: deleteResult?.deleted || 0,
      });
    } catch (error) {
      console.error('Civitai import error:', error);
      res.status(500).json({ message: 'Failed to import Civitai images' });
    }
  });

  // Civitai Auto-Fetch endpoints
  app.get('/api/civitai/autofetch/status', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      res.json({
        ...getAutoFetchStatus(),
        settings: settings.civitaiAutoFetchSettings || null,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/civitai/autofetch/start', async (req: Request, res: Response) => {
    try {
      await startAutoFetch();
      res.json({ success: true, ...getAutoFetchStatus() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/civitai/autofetch/stop', async (req: Request, res: Response) => {
    try {
      stopAutoFetch();
      res.json({ success: true, running: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/civitai/autofetch/settings', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      settings.civitaiAutoFetchSettings = req.body;
      await storage.saveUserSettings(settings);
      res.json({ success: true, settings: req.body });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/civitai/autofetch/clear', async (req: Request, res: Response) => {
    try {
      const cleared = clearAutoFetchBuffer();
      res.json({ success: true, clearedCount: cleared.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/civitai/autofetch/process-now', async (req: Request, res: Response) => {
    try {
      await forceProcessBuffer();
      res.json({ success: true, ...getAutoFetchStatus() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Folder Mappings CRUD
  app.get('/api/folder-mappings', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      res.json(settings.folderMappings || []);
    } catch (error) {
      res.status(500).json({ message: 'Failed to load folder mappings' });
    }
  });

  app.post('/api/folder-mappings', async (req: Request, res: Response) => {
    try {
      const { name, importFolder, driveConfig, wordpressConfig, discordWebhookId } = req.body;
      if (!name || !importFolder) {
        return res.status(400).json({ message: 'Name and import folder are required' });
      }
      const settings = await storage.getUserSettings();
      const mappings = settings.folderMappings || [];
      const newMapping = {
        id: randomUUID(),
        name,
        importFolder,
        driveConfig: driveConfig || {},
        wordpressConfig,
        discordWebhookId,
      };
      mappings.push(newMapping);
      settings.folderMappings = mappings;
      await storage.saveUserSettings(settings);
      res.json(newMapping);
    } catch (error) {
      res.status(500).json({ message: 'Failed to create folder mapping' });
    }
  });

  app.put('/api/folder-mappings/:id', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      const mappings = settings.folderMappings || [];
      const index = mappings.findIndex(m => m.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ message: 'Folder mapping not found' });
      }
      mappings[index] = { ...mappings[index], ...req.body, id: req.params.id };
      settings.folderMappings = mappings;
      await storage.saveUserSettings(settings);
      res.json(mappings[index]);
    } catch (error) {
      res.status(500).json({ message: 'Failed to update folder mapping' });
    }
  });

  app.delete('/api/folder-mappings/:id', async (req: Request, res: Response) => {
    try {
      const settings = await storage.getUserSettings();
      const mappings = settings.folderMappings || [];
      settings.folderMappings = mappings.filter(m => m.id !== req.params.id);
      await storage.saveUserSettings(settings);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete folder mapping' });
    }
  });

  // === Folder Watcher Endpoints ===

  app.get('/api/watcher/status', async (req: Request, res: Response) => {
    try {
      const folders = await getWatchedFolders();
      res.json({
        running: isWatcherRunning(),
        folders,
        recentEvents: getRecentEvents().slice(0, 20),
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to get watcher status' });
    }
  });

  app.post('/api/watcher/start', async (req: Request, res: Response) => {
    try {
      await startWatcher();
      res.json({ success: true, running: true });
    } catch (error) {
      res.status(500).json({ message: 'Failed to start watcher' });
    }
  });

  app.post('/api/watcher/stop', async (req: Request, res: Response) => {
    try {
      stopWatcher();
      res.json({ success: true, running: false });
    } catch (error) {
      res.status(500).json({ message: 'Failed to stop watcher' });
    }
  });

  app.get('/api/watcher/events', async (req: Request, res: Response) => {
    try {
      res.json(getRecentEvents());
    } catch (error) {
      res.status(500).json({ message: 'Failed to get events' });
    }
  });

  app.get('/api/watched-folders', async (req: Request, res: Response) => {
    try {
      const folders = await getWatchedFolders();
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: 'Failed to get watched folders' });
    }
  });

  app.post('/api/watched-folders', async (req: Request, res: Response) => {
    try {
      const { localPath, mappingId, driveConfig, enabled, pollIntervalMs } = req.body;
      if (!localPath) {
        return res.status(400).json({ message: 'localPath is required' });
      }
      const folder = await addWatchedFolder({
        localPath,
        mappingId,
        driveConfig,
        enabled: enabled !== false,
        pollIntervalMs: pollIntervalMs || 5000,
      });
      res.json(folder);
    } catch (error) {
      res.status(500).json({ message: 'Failed to add watched folder' });
    }
  });

  app.put('/api/watched-folders/:id', async (req: Request, res: Response) => {
    try {
      const folder = await updateWatchedFolder(req.params.id, req.body);
      if (!folder) {
        return res.status(404).json({ message: 'Watched folder not found' });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ message: 'Failed to update watched folder' });
    }
  });

  app.delete('/api/watched-folders/:id', async (req: Request, res: Response) => {
    try {
      const removed = await removeWatchedFolder(req.params.id);
      if (!removed) {
        return res.status(404).json({ message: 'Watched folder not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Failed to remove watched folder' });
    }
  });

  app.post('/api/watched-folders/:id/reset', async (req: Request, res: Response) => {
    try {
      resetFolder(req.params.id);
      res.json({ success: true, message: 'Folder reset - existing files will be re-processed on next scan' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to reset folder' });
    }
  });

  return httpServer;
}
