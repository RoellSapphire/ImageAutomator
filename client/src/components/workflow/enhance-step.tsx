import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ImageIcon, Maximize, FileType, Droplets, Type } from "lucide-react";
import type { EnhanceConfig, ProcessedImage } from "@/lib/types";

interface EnhanceStepProps {
  images: ProcessedImage[];
  config: EnhanceConfig;
  onConfigChange: (config: EnhanceConfig) => void;
}

const WATERMARK_POSITIONS = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
  { value: "center", label: "Center" },
] as const;

const OUTPUT_FORMATS = [
  { value: "original", label: "Keep Original" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
] as const;

export function EnhanceStep({ images, config, onConfigChange }: EnhanceStepProps) {
  const [localConfig, setLocalConfig] = useState<EnhanceConfig>(config);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Enhance Images</h2>
        <p className="text-muted-foreground mt-1">
          Configure image processing options like resize, format, and watermark
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Maximize className="h-5 w-5" />
                Resize Options
              </CardTitle>
              <CardDescription>
                Adjust image dimensions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="resize-toggle">Enable Resize</Label>
                  <p className="text-xs text-muted-foreground">
                    Resize images to specific dimensions
                  </p>
                </div>
                <Switch
                  id="resize-toggle"
                  checked={localConfig.resize}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, resize: checked })}
                  data-testid="switch-resize"
                />
              </div>

              {localConfig.resize && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width">Width (px)</Label>
                      <Input
                        id="width"
                        type="number"
                        min={1}
                        max={10000}
                        placeholder="e.g., 1920"
                        value={localConfig.width || ""}
                        onChange={(e) => setLocalConfig({ 
                          ...localConfig, 
                          width: e.target.value ? parseInt(e.target.value) : undefined 
                        })}
                        data-testid="input-width"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height (px)</Label>
                      <Input
                        id="height"
                        type="number"
                        min={1}
                        max={10000}
                        placeholder="e.g., 1080"
                        value={localConfig.height || ""}
                        onChange={(e) => setLocalConfig({ 
                          ...localConfig, 
                          height: e.target.value ? parseInt(e.target.value) : undefined 
                        })}
                        data-testid="input-height"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="aspect-ratio">Maintain Aspect Ratio</Label>
                      <p className="text-xs text-muted-foreground">
                        Preserve original proportions
                      </p>
                    </div>
                    <Switch
                      id="aspect-ratio"
                      checked={localConfig.maintainAspectRatio}
                      onCheckedChange={(checked) => setLocalConfig({ ...localConfig, maintainAspectRatio: checked })}
                      data-testid="switch-aspect-ratio"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileType className="h-5 w-5" />
                Format & Quality
              </CardTitle>
              <CardDescription>
                Output format and compression settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="format">Output Format</Label>
                <Select
                  value={localConfig.outputFormat}
                  onValueChange={(value) => setLocalConfig({ 
                    ...localConfig, 
                    outputFormat: value as EnhanceConfig["outputFormat"] 
                  })}
                >
                  <SelectTrigger id="format" data-testid="select-format">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_FORMATS.map((format) => (
                      <SelectItem key={format.value} value={format.value}>
                        {format.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Quality</Label>
                  <Badge variant="secondary">{localConfig.quality}%</Badge>
                </div>
                <Slider
                  value={[localConfig.quality]}
                  onValueChange={([value]) => setLocalConfig({ ...localConfig, quality: value })}
                  min={1}
                  max={100}
                  step={1}
                  className="w-full"
                  data-testid="slider-quality"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Low (1%)</span>
                  <span>High (100%)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                Metadata
              </CardTitle>
              <CardDescription>
                EXIF data and privacy options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="exif-toggle">Remove EXIF Data</Label>
                  <p className="text-xs text-muted-foreground">
                    Strip metadata for privacy
                  </p>
                </div>
                <Switch
                  id="exif-toggle"
                  checked={localConfig.removeExif}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, removeExif: checked })}
                  data-testid="switch-exif"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Type className="h-5 w-5" />
                Watermark
              </CardTitle>
              <CardDescription>
                Add text watermark to images
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="watermark-toggle">Add Watermark</Label>
                  <p className="text-xs text-muted-foreground">
                    Overlay text on images
                  </p>
                </div>
                <Switch
                  id="watermark-toggle"
                  checked={localConfig.addWatermark}
                  onCheckedChange={(checked) => setLocalConfig({ ...localConfig, addWatermark: checked })}
                  data-testid="switch-watermark"
                />
              </div>

              {localConfig.addWatermark && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="watermark-text">Watermark Text</Label>
                    <Input
                      id="watermark-text"
                      placeholder="e.g., © My Brand"
                      value={localConfig.watermarkText || ""}
                      onChange={(e) => setLocalConfig({ ...localConfig, watermarkText: e.target.value })}
                      data-testid="input-watermark-text"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="watermark-position">Position</Label>
                    <Select
                      value={localConfig.watermarkPosition}
                      onValueChange={(value) => setLocalConfig({ 
                        ...localConfig, 
                        watermarkPosition: value as EnhanceConfig["watermarkPosition"] 
                      })}
                    >
                      <SelectTrigger id="watermark-position" data-testid="select-watermark-position">
                        <SelectValue placeholder="Select position" />
                      </SelectTrigger>
                      <SelectContent>
                        {WATERMARK_POSITIONS.map((pos) => (
                          <SelectItem key={pos.value} value={pos.value}>
                            {pos.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Images to process</span>
                  <span className="font-medium">{images.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Resize</span>
                  <span className="font-medium">
                    {localConfig.resize 
                      ? `${localConfig.width || "auto"} × ${localConfig.height || "auto"}` 
                      : "No"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Output format</span>
                  <span className="font-medium">
                    {OUTPUT_FORMATS.find(f => f.value === localConfig.outputFormat)?.label}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remove EXIF</span>
                  <span className="font-medium">{localConfig.removeExif ? "Yes" : "No"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Watermark</span>
                  <span className="font-medium">{localConfig.addWatermark ? "Yes" : "No"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
