# Civitai Flow - Image Workflow Automation

## Overview
A workflow automation app for processing Civitai images. The app automates the process of extracting ZIP files, renaming images, enhancing them (resize, EXIF removal, watermarks), exporting to Google Drive, and publishing to WordPress with ARMember permissions.

## Current State
- **MVP Complete**: Full 5-step workflow is implemented
- **Backend**: Express server with file processing using Sharp
- **Frontend**: React with shadcn/ui components
- **Integrations**: Google Drive (Replit connector), WordPress REST API

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

## User Preferences
- Dark mode preferred
- Inter font for UI
- Clean, linear-inspired design

## Recent Changes
- 2026-01-13: Initial MVP implementation
  - Full workflow UI with 5 steps
  - Backend image processing
  - Google Drive integration
  - WordPress REST API integration

## Running the Project
The app runs on port 5000 using `npm run dev` which starts both the Express server and Vite dev server.
