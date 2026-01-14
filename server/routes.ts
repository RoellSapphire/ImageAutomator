import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import AdmZip from "adm-zip";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { ProcessedImage, RenameConfig, EnhanceConfig, WordPressConfig, DriveConfig, WatermarkImage } from "@shared/schema";
import { checkDriveConnection, findOrCreateFolder, uploadFileToDrive, listFolders, getAuthUrl, handleOAuthCallback, clearTokens } from "./google-drive";
import { getCivitaiUser, getGenerationFeed, downloadImage, deleteGeneratedImages, type GenerationFeedImage } from "./civitai";
import * as deviantart from "./deviantart";

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
      const { workflowId, renameConfig, enhanceConfig, skipRename, skipEnhance } = req.body as {
        workflowId: string;
        renameConfig: RenameConfig;
        enhanceConfig: EnhanceConfig;
        skipRename?: boolean;
        skipEnhance?: boolean;
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

      res.json({
        images: processedImages,
        message: `Processed ${processedImages.filter(i => i.status === 'completed').length} images`,
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

      let folderPath = driveConfig.folderPath || '/Civitai Images';
      if (driveConfig.createSubfolder && driveConfig.subfolderName) {
        folderPath = `${folderPath}/${driveConfig.subfolderName}`;
      }

      const folderId = await findOrCreateFolder(folderPath);
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
          const result = await uploadFileToDrive(imagePath, image.newName, mimeType, folderId);
          uploadedFiles.push({
            name: image.newName,
            id: result.id,
            link: result.webViewLink,
          });
        } catch (uploadError) {
          console.error(`Failed to upload ${image.newName} to Drive:`, uploadError);
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
          // ARMember uses post meta to restrict content to specific plans
          // The meta key format is arm_access_plan_{plan_id} with value '1'
          const metaResponse = await fetch(`${wordpressConfig.siteUrl}/wp-json/wp/v2/posts/${post.id}`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              meta: {
                [`arm_access_plan_${wordpressConfig.armemberPlanId}`]: '1',
                'arm_restrict_post': '1',
              },
            }),
          });
          
          if (!metaResponse.ok) {
            console.log('ARMember meta update failed, status:', metaResponse.status);
            // Try alternative approach using WordPress meta endpoint
            const altMetaResponse = await fetch(`${wordpressConfig.siteUrl}/wp-json/wp/v2/posts/${post.id}/meta`, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                key: `arm_access_plan_${wordpressConfig.armemberPlanId}`,
                value: '1',
              }),
            });
            console.log('Alt meta response:', altMetaResponse.status);
          } else {
            console.log('ARMember restriction applied via post meta');
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

      const response = await getGenerationFeed(apiKey, {
        cursor,
        take,
      });

      // Transform generation feed items to a consistent format
      const images = response.items.map(item => {
        // Get the first available image from steps
        const imageUrl = item.steps?.[0]?.images?.find(img => img.available)?.url;
        return {
          id: item.id,
          url: imageUrl || '',
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
        };
      }).filter(img => img.url); // Only include images with available URLs

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
        imageUrls: Array<{ url: string; width: number; height: number; id: string }>;
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
      let deleteResult = null;
      if (deleteAfterImport && images.length > 0) {
        const idsToDelete = imageUrls.map(img => img.id);
        console.log(`Deleting ${idsToDelete.length} images from Civitai...`);
        deleteResult = await deleteGeneratedImages(apiKey, idsToDelete);
        console.log(`Delete result: ${deleteResult.deleted} deleted, ${deleteResult.errors.length} errors`);
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

  // DeviantArt OAuth routes
  app.get('/api/deviantart/auth-url', (req: Request, res: Response) => {
    const clientId = process.env.DEVIANTART_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ message: 'DeviantArt client ID not configured' });
    }
    
    const redirectUri = `${req.protocol}://${req.get('host')}/api/deviantart/callback`;
    const state = randomUUID();
    const authUrl = deviantart.getAuthUrl(clientId, redirectUri, state);
    
    res.json({ authUrl, state });
  });

  app.get('/api/deviantart/callback', async (req: Request, res: Response) => {
    const { code, state } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.redirect('/?error=deviantart_auth_failed');
    }

    const clientId = process.env.DEVIANTART_CLIENT_ID;
    const clientSecret = process.env.DEVIANTART_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.redirect('/?error=deviantart_not_configured');
    }

    try {
      const redirectUri = `${req.protocol}://${req.get('host')}/api/deviantart/callback`;
      const tokens = await deviantart.exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);
      
      // Store tokens in settings
      const settings = await storage.getUserSettings();
      settings.deviantartTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };
      await storage.saveUserSettings(settings);
      
      res.redirect('/?deviantart=connected');
    } catch (error) {
      console.error('DeviantArt OAuth error:', error);
      res.redirect('/?error=deviantart_auth_failed');
    }
  });

  app.get('/api/deviantart/status', async (req: Request, res: Response) => {
    const settings = await storage.getUserSettings();
    const tokens = settings.deviantartTokens;
    
    if (!tokens || !tokens.accessToken) {
      return res.json({ connected: false });
    }
    
    // Check if token is expired
    if (tokens.expiresAt && Date.now() > tokens.expiresAt) {
      // Try to refresh
      const clientId = process.env.DEVIANTART_CLIENT_ID;
      const clientSecret = process.env.DEVIANTART_CLIENT_SECRET;
      
      if (clientId && clientSecret && tokens.refreshToken) {
        try {
          const newTokens = await deviantart.refreshAccessToken(tokens.refreshToken, clientId, clientSecret);
          settings.deviantartTokens = {
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            expiresAt: Date.now() + newTokens.expires_in * 1000,
          };
          await storage.saveUserSettings(settings);
          return res.json({ connected: true });
        } catch (error) {
          console.error('Failed to refresh DeviantArt token:', error);
          return res.json({ connected: false, error: 'Token expired' });
        }
      }
      return res.json({ connected: false, error: 'Token expired' });
    }
    
    res.json({ connected: true });
  });

  app.post('/api/deviantart/disconnect', async (req: Request, res: Response) => {
    const settings = await storage.getUserSettings();
    delete settings.deviantartTokens;
    await storage.saveUserSettings(settings);
    res.json({ success: true });
  });

  // DeviantArt scheduled uploads
  app.get('/api/deviantart/scheduled', async (req: Request, res: Response) => {
    const uploads = await deviantart.getScheduledUploads();
    res.json({ 
      uploads,
      schedulerRunning: deviantart.isSchedulerRunning(),
    });
  });

  app.post('/api/deviantart/schedule', async (req: Request, res: Response) => {
    const { imageUrl, title, description, category, isMature, scheduledTime } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ message: 'Image URL required' });
    }
    
    const upload = await deviantart.addScheduledUpload({
      imageUrl: imageUrl,
      title: title || 'Untitled',
      description: description || '',
      category: category || 'digitalart/drawings',
      isMature: isMature || false,
      scheduledTime: new Date(scheduledTime || Date.now()).toISOString(),
    });
    
    res.json({ success: true, upload });
  });

  app.delete('/api/deviantart/scheduled/:id', async (req: Request, res: Response) => {
    const success = await deviantart.removeScheduledUpload(req.params.id);
    res.json({ success });
  });

  app.post('/api/deviantart/scheduler/start', async (req: Request, res: Response) => {
    const { intervalMinutes } = req.body;
    const settings = await storage.getUserSettings();
    const tokens = settings.deviantartTokens;
    
    if (!tokens?.accessToken) {
      return res.status(400).json({ message: 'Not connected to DeviantArt' });
    }
    
    deviantart.startScheduler(tokens.accessToken, intervalMinutes || 60);
    res.json({ success: true, message: 'Scheduler started' });
  });

  app.post('/api/deviantart/scheduler/stop', (req: Request, res: Response) => {
    deviantart.stopScheduler();
    res.json({ success: true, message: 'Scheduler stopped' });
  });

  app.post('/api/deviantart/upload', async (req: Request, res: Response) => {
    const { imageUrl, title, description, category, isMature } = req.body;
    
    const settings = await storage.getUserSettings();
    const tokens = settings.deviantartTokens;
    
    if (!tokens?.accessToken) {
      return res.status(400).json({ message: 'Not connected to DeviantArt' });
    }
    
    try {
      // Download image
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      const result = await deviantart.uploadAndPublish(
        tokens.accessToken,
        imageBuffer,
        'image.png',
        title || 'Untitled',
        description || '',
        category || 'digitalart/drawings',
        isMature || false
      );
      
      res.json({ 
        success: true, 
        url: result.publishResponse.url,
        deviationId: result.publishResponse.deviationid,
      });
    } catch (error: any) {
      console.error('DeviantArt upload error:', error);
      res.status(500).json({ message: error.message || 'Upload failed' });
    }
  });

  return httpServer;
}
