# Civitai Flow - Image Workflow Automation

## Overview
A workflow automation app for processing Civitai images. The app automates the process of extracting ZIP files, renaming images, enhancing them (resize, EXIF removal, watermarks), exporting to Google Drive, and publishing to WordPress with ARMember permissions.

## Current State
- **MVP Complete**: Full 5-step workflow is implemented
- **Auto Mode**: Automatic processing of all workflow steps after upload
- **Backend**: Express server with file processing using Sharp
- **Frontend**: React with shadcn/ui components
- **Integrations**: Google Drive (Replit connector), WordPress REST API, Discord (Replit connector)

## Project Architecture

### Frontend (client/)
- React + TypeScript + Vite
- shadcn/ui components
- TanStack Query for data fetching
- Wouter for routing
- Theme support (dark/light mode)

### Backend (server/)
- Express.js server
- File handling with multer
- Image processing with Sharp
- AdmZip for ZIP extraction
- Google Drive API integration

### Key Files
- `client/src/App.tsx` - Main app with routing
- `client/src/pages/home.tsx` - Home page with sidebar layout
- `client/src/components/workflow/` - All workflow step components
- `server/routes.ts` - API endpoints
- `server/storage.ts` - In-memory storage
- `server/google-drive.ts` - Google Drive integration
- `shared/schema.ts` - Type definitions and schemas

## Workflow Steps
1. **Upload** - Upload ZIP file or folder with images
2. **Rename** - Configure naming pattern (prefix + sequence number)
3. **Enhance** - Resize, remove EXIF, add watermark, change format
4. **Export** - Save to Google Drive folder
5. **Publish** - Create WordPress post with ARMember permissions

## API Endpoints
- `POST /api/upload` - Upload and extract ZIP file
- `POST /api/upload-folder` - Upload multiple image files from folder
- `GET /api/thumbnail/:imageId` - Get image thumbnail
- `POST /api/process` - Process images (rename, enhance)
- `GET /api/download/:workflowId` - Download processed images as ZIP
- `GET /api/drive/status` - Check Google Drive connection
- `POST /api/drive/export` - Export images to Google Drive
- `POST /api/wordpress/verify` - Verify WordPress credentials
- `POST /api/publish` - Publish post to WordPress
- `GET /api/discord/status` - Check Discord connection
- `GET /api/discord/guilds` - List Discord servers
- `GET /api/discord/channels/:guildId` - List server channels
- `POST /api/discord/post` - Post images via OAuth
- `POST /api/discord/webhook` - Post images via webhook URL

## User Preferences
- Dark mode preferred
- Inter font for UI
- Clean, linear-inspired design

## Recent Changes
- 2026-01-15: Auto Mode UI improvements
  - Flipped toggle semantics: "Enable X" with toggle right = enabled (better UX than "Skip X")
  - Settings accordions now conditionally render based on enable state (less clutter)
  - Added Discord to Auto Mode with webhook preset selector
  - Moved Description Template into Publish Settings accordion
  - Settings persistence updated with skipDiscord and discordWebhookId fields
- 2026-01-15: Discord webhook manager and improvements
  - Webhook manager: Save, edit, and delete up to 40 webhook presets with friendly names
  - Auto-batching: Automatically splits images into groups of 10 per message (Discord limit) with 1-second delay
  - OAuth error handling: Clear error messages when channel loading fails, recommends webhook mode
  - Webhook CRUD API: GET/POST/PUT/DELETE /api/discord/webhooks endpoints
- 2026-01-15: Discord posting integration
  - Added Discord posting to Export step with two modes: Webhook (recommended) and OAuth (beta)
  - Webhook mode: Simple and reliable - paste a Discord webhook URL to post images
  - OAuth mode: Uses Replit Discord connector for server/channel selection (may have permission limitations)
  - Backend: REST API implementation with proper multipart file attachments
- 2026-01-14: Bug fixes and improvements
  - DeviantArt upload: Added token refresh handling with retry on 401 errors
  - DeviantArt scheduler: Fixed scheduled upload persistence with filePath field
  - Civitai import: Fixed to load ALL images from batches (was only loading first image)
  - Civitai delete: Improved batch ID extraction for compound image IDs (best-effort)
  - WordPress ARMember: Fixed post restriction to use correct `arm_access_plan_ids` array format
- 2026-01-13: Auto Mode implementation
  - Auto Mode toggle on Upload step for one-click processing
  - Auto title generation (date + "Update" format)
  - 10 built-in description templates for WordPress posts
  - Skip options for Google Drive export and WordPress publish
  - Pre-flight validation warnings for missing configurations
  - Settings persistence across devices (server-side JSON file)
- 2026-01-13: Initial MVP implementation
  - Full workflow UI with 5 steps
  - Backend image processing
  - Google Drive integration
  - WordPress REST API integration

## Running the Project
The app runs on port 5000 using `npm run dev` which starts both the Express server and Vite dev server.
