import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import AdmZip from "adm-zip";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { ProcessedImage, RenameConfig, EnhanceConfig, WordPressConfig } from "@shared/schema";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PROCESSED_DIR = path.join(process.cwd(), "processed");
const THUMBNAILS_DIR = path.join(process.cwd(), "thumbnails");

[UPLOAD_DIR, PROCESSED_DIR, THUMBNAILS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];

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

  app.post('/api/process', async (req: Request, res: Response) => {
    try {
      const { workflowId, renameConfig, enhanceConfig } = req.body as {
        workflowId: string;
        renameConfig: RenameConfig;
        enhanceConfig: EnhanceConfig;
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
          const number = (renameConfig.startNumber + i).toString().padStart(renameConfig.padding, '0');
          const ext = enhanceConfig.outputFormat === 'original' 
            ? path.extname(image.originalName).slice(1)
            : enhanceConfig.outputFormat;
          const newName = `${renameConfig.prefix}${renameConfig.separator}${number}.${ext}`;
          const processedPath = path.join(processedDir, newName);

          let sharpInstance = sharp(image.originalPath);

          if (enhanceConfig.resize && (enhanceConfig.width || enhanceConfig.height)) {
            sharpInstance = sharpInstance.resize({
              width: enhanceConfig.width,
              height: enhanceConfig.height,
              fit: enhanceConfig.maintainAspectRatio ? 'inside' : 'fill',
            });
          }

          if (enhanceConfig.removeExif) {
            sharpInstance = sharpInstance.rotate();
          }

          if (enhanceConfig.addWatermark && enhanceConfig.watermarkText) {
            const metadata = await sharp(image.originalPath).metadata();
            const width = metadata.width || 800;
            const height = metadata.height || 600;
            
            const fontSize = Math.max(16, Math.floor(width / 30));
            const padding = 20;
            
            let x = padding;
            let y = padding + fontSize;
            
            switch (enhanceConfig.watermarkPosition) {
              case 'top-right':
                x = width - padding;
                break;
              case 'bottom-left':
                y = height - padding;
                break;
              case 'bottom-right':
                x = width - padding;
                y = height - padding;
                break;
              case 'center':
                x = width / 2;
                y = height / 2;
                break;
            }

            const textAlign = enhanceConfig.watermarkPosition.includes('right') ? 'end' : 
                             enhanceConfig.watermarkPosition === 'center' ? 'middle' : 'start';

            const watermarkSvg = `
              <svg width="${width}" height="${height}">
                <text 
                  x="${x}" 
                  y="${y}" 
                  font-family="Arial, sans-serif" 
                  font-size="${fontSize}" 
                  fill="rgba(255,255,255,0.7)"
                  text-anchor="${textAlign}"
                  dominant-baseline="${enhanceConfig.watermarkPosition.includes('bottom') ? 'text-after-edge' : 'hanging'}"
                >
                  ${enhanceConfig.watermarkText}
                </text>
              </svg>
            `;

            sharpInstance = sharpInstance.composite([{
              input: Buffer.from(watermarkSvg),
              blend: 'over',
            }]);
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

  app.post('/api/wordpress/verify', async (req: Request, res: Response) => {
    try {
      const { siteUrl, username, applicationPassword } = req.body;

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
      
      try {
        const plansResponse = await fetch(`${siteUrl}/wp-json/armember/v1/plans`, {
          headers: {
            'Authorization': `Basic ${auth}`,
          },
        });
        
        if (plansResponse.ok) {
          const plansData = await plansResponse.json();
          if (Array.isArray(plansData)) {
            armemberPlans = plansData.map((plan: any) => ({
              id: String(plan.arm_subscription_plan_id || plan.id),
              name: plan.arm_subscription_plan_name || plan.name || 'Unknown Plan',
              description: plan.arm_subscription_plan_description || plan.description,
            }));
          }
        }
      } catch (planError) {
        console.log('ARMember plans not available or not accessible');
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

      const mediaIds: number[] = [];
      
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
            mediaIds.push(mediaData.id);
          }
        } catch (uploadError) {
          console.error(`Failed to upload ${image.newName}:`, uploadError);
        }
      }

      let postContent = wordpressConfig.postContent || '';
      
      if (mediaIds.length > 0) {
        const galleryBlock = `<!-- wp:gallery {"ids":[${mediaIds.join(',')}],"columns":3,"linkTo":"none"} -->
<figure class="wp-block-gallery has-nested-images columns-3 is-cropped">
${mediaIds.map(id => `<!-- wp:image {"id":${id}} --><figure class="wp-block-image"><img src="" alt="" class="wp-image-${id}"/></figure><!-- /wp:image -->`).join('\n')}
</figure>
<!-- /wp:gallery -->`;
        
        postContent = postContent + '\n\n' + galleryBlock;
      }

      const postData: any = {
        title: wordpressConfig.postTitle || 'Civitai Images',
        content: postContent,
        status: wordpressConfig.postStatus,
      };

      if (mediaIds.length > 0) {
        postData.featured_media = mediaIds[0];
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
          await fetch(`${wordpressConfig.siteUrl}/wp-json/armember/v1/restrict`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              post_id: post.id,
              plan_id: wordpressConfig.armemberPlanId,
            }),
          });
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

  return httpServer;
}
