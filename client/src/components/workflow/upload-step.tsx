import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileArchive, Images, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcessedImage } from "@/lib/types";

interface UploadStepProps {
  onUploadComplete: (images: ProcessedImage[], workflowId: string) => void;
  uploadedImages: ProcessedImage[];
  workflowId: string | null;
}

export function UploadStep({ onUploadComplete, uploadedImages, workflowId }: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<"zip" | "images">("zip");
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleZipFile(files[0]);
    }
  }, []);

  const handleImagesInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageFiles(Array.from(files));
    }
  }, []);

  const handleZipFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError("Please upload a ZIP file");
      return;
    }

    setFileName(file.name);
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setIsUploading(false);
          setUploadProgress(100);
          onUploadComplete(response.images, response.workflowId);
        } else {
          setError("Upload failed. Please try again.");
          setIsUploading(false);
        }
      };

      xhr.onerror = () => {
        setError("Network error. Please try again.");
        setIsUploading(false);
      };

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (err) {
      setError("Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

  const handleImageFiles = async (files: File[]) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
    const imageFiles = files.filter(file => {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      return imageExtensions.includes(ext);
    });

    if (imageFiles.length === 0) {
      setError("No image files found in folder");
      return;
    }

    setFileName(`${imageFiles.length} image files`);
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    imageFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setIsUploading(false);
          setUploadProgress(100);
          onUploadComplete(response.images, response.workflowId);
        } else {
          setError("Upload failed. Please try again.");
          setIsUploading(false);
        }
      };

      xhr.onerror = () => {
        setError("Network error. Please try again.");
        setIsUploading(false);
      };

      xhr.open('POST', '/api/upload-folder');
      xhr.send(formData);
    } catch (err) {
      setError("Upload failed. Please try again.");
      setIsUploading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.name.endsWith('.zip')) {
      handleZipFile(file);
    } else {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (imageExtensions.includes(ext)) {
        handleImageFiles([file]);
      } else {
        setError("Please upload a ZIP file or image files");
      }
    }
  };

  const hasImages = uploadedImages.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Upload Images</h2>
        <p className="text-muted-foreground mt-1">
          Upload images from a ZIP file or select individual image files
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">File Upload</CardTitle>
          <CardDescription>
            Choose to upload a ZIP file or select image files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as "zip" | "images")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="zip" className="flex items-center gap-2" data-testid="tab-zip-upload">
                <FileArchive className="h-4 w-4" />
                ZIP File
              </TabsTrigger>
              <TabsTrigger value="images" className="flex items-center gap-2" data-testid="tab-images-upload">
                <Images className="h-4 w-4" />
                Select Images
              </TabsTrigger>
            </TabsList>

            <TabsContent value="zip" className="mt-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-12 transition-colors",
                  "flex flex-col items-center justify-center gap-4 text-center",
                  isDragging && "border-primary bg-primary/5",
                  !isDragging && !hasImages && "border-muted-foreground/25 hover:border-muted-foreground/50",
                  hasImages && "border-green-500/50 bg-green-500/5"
                )}
                data-testid="upload-dropzone-zip"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    <div className="space-y-2 w-full max-w-xs">
                      <p className="text-sm font-medium">Uploading {fileName}...</p>
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                    </div>
                  </>
                ) : hasImages ? (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        {uploadedImages.length} images uploaded successfully
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        From: {fileName}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('file-input')?.click()}
                      data-testid="button-upload-new-zip"
                    >
                      Upload Different File
                    </Button>
                  </>
                ) : (
                  <>
                    <div className={cn(
                      "p-4 rounded-full",
                      isDragging ? "bg-primary/10" : "bg-muted"
                    )}>
                      {isDragging ? (
                        <FileArchive className="h-10 w-10 text-primary" />
                      ) : (
                        <Upload className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {isDragging ? "Drop your ZIP file here" : "Drop ZIP file here or click to browse"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports .zip files containing images
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('file-input')?.click()}
                      data-testid="button-browse-zip"
                    >
                      Browse Files
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="images" className="mt-4">
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-12 transition-colors",
                  "flex flex-col items-center justify-center gap-4 text-center",
                  !hasImages && "border-muted-foreground/25 hover:border-muted-foreground/50",
                  hasImages && "border-green-500/50 bg-green-500/5"
                )}
                data-testid="upload-dropzone-images"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    <div className="space-y-2 w-full max-w-xs">
                      <p className="text-sm font-medium">Uploading {fileName}...</p>
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                    </div>
                  </>
                ) : hasImages ? (
                  <>
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-600 dark:text-green-400">
                        {uploadedImages.length} images uploaded successfully
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        From: {fileName}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => imagesInputRef.current?.click()}
                      data-testid="button-upload-new-images"
                    >
                      Select Different Images
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-muted">
                      <Images className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Click to select image files
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports JPG, PNG, WebP, GIF, BMP, TIFF images
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => imagesInputRef.current?.click()}
                      data-testid="button-browse-images"
                    >
                      Select Images
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <input
            id="file-input"
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleFileInput}
            data-testid="input-file-upload"
          />
          <input
            ref={imagesInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImagesInput}
            multiple
            data-testid="input-images-upload"
          />

          {error && (
            <div className="mt-4 flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {hasImages && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Extracted Images</CardTitle>
            <CardDescription>
              Preview of images from your ZIP file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {uploadedImages.slice(0, 10).map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                  data-testid={`image-preview-${image.id}`}
                >
                  <img
                    src={`/api/thumbnail/${image.id}`}
                    alt={image.originalName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white truncate">{image.originalName}</p>
                  </div>
                </div>
              ))}
            </div>
            {uploadedImages.length > 10 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                +{uploadedImages.length - 10} more images
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
