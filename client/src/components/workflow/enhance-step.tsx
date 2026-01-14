import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ImageIcon, Maximize, FileType, Droplets, Upload, X, Percent, Ban } from "lucide-react";
import type { EnhanceConfig, ProcessedImage, WatermarkImage } from "@/lib/types";

interface EnhanceStepProps {
  images: ProcessedImage[];
  config: EnhanceConfig;
  onConfigChange: (config: EnhanceConfig) => void;
  skipEnhance?: boolean;
  onSkipEnhanceChange?: (skip: boolean) => void;
}

const WATERMARK_POSITIONS = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
  { value: "center", label: "Center" },
  { value: "tile", label: "Tile (Repeat)" },
] as const;

const OUTPUT_FORMATS = [
  { value: "original", label: "Keep Original" },
  { value: "jpeg", label: "JPEG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WebP" },
] as const;

export function EnhanceStep({ images, config, onConfigChange, skipEnhance = false, onSkipEnhanceChange }: EnhanceStepProps) {
  const [localConfig, setLocalConfig] = useState<EnhanceConfig>(config);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  const handleWatermarkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount = localConfig.watermarkImages?.length || 0;
    const remainingSlots = 3 - currentCount;
    
    if (remainingSlots <= 0) return;

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const formData = new FormData();
    filesToUpload.forEach(file => formData.append('watermarks', file));

    try {
      const response = await fetch('/api/watermarks/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        setLocalConfig(prev => ({
          ...prev,
          watermarkImages: [...(prev.watermarkImages || []), ...data.watermarks],
        }));
      }
    } catch (error) {
      console.error('Failed to upload watermarks:', error);
    }
    
    if (watermarkInputRef.current) {
      watermarkInputRef.current.value = '';
    }
  };

  const removeWatermark = (id: string) => {
    setLocalConfig(prev => ({
      ...prev,
      watermarkImages: (prev.watermarkImages || []).filter(w => w.id !== id),
    }));
  };

  const updateWatermark = (id: string, updates: Partial<WatermarkImage>) => {
    setLocalConfig(prev => ({
      ...prev,
      watermarkImages: (prev.watermarkImages || []).map(w => 
        w.id === id ? { ...w, ...updates } : w
      ),
    }));
  };

  const watermarkCount = localConfig.watermarkImages?.length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Enhance Images</h2>
        <p className="text-muted-foreground mt-1">
          Configure image processing options like resize, format, and watermark
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skip-enhance" className="flex items-center gap-2">
                <Ban className="h-4 w-4" />
                Skip Enhancement
              </Label>
              <p className="text-xs text-muted-foreground">
                Copy images without any processing
              </p>
            </div>
            <Switch
              id="skip-enhance"
              checked={skipEnhance}
              onCheckedChange={(checked) => onSkipEnhanceChange?.(checked)}
              data-testid="switch-skip-enhance"
            />
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-6 lg:grid-cols-2 ${skipEnhance ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Maximize className="h-5 w-5" />
                Resize Options
              </CardTitle>
              <CardDescription>
                Adjust image dimensions by scale factor or specific size
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="resize-toggle">Enable Resize</Label>
                  <p className="text-xs text-muted-foreground">
                    Change image dimensions
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Resize Mode</Label>
                      <Select
                        value={localConfig.resizeMode || "scale"}
                        onValueChange={(value) => setLocalConfig({ 
                          ...localConfig, 
                          resizeMode: value as "scale" | "dimensions"
                        })}
                      >
                        <SelectTrigger data-testid="select-resize-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scale">Scale Factor (%)</SelectItem>
                          <SelectItem value="dimensions">Fixed Dimensions</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(localConfig.resizeMode || "scale") === "scale" ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center gap-2">
                            <Percent className="h-4 w-4" />
                            Scale Factor
                          </Label>
                          <Badge variant="secondary">{localConfig.scaleFactor || 100}%</Badge>
                        </div>
                        <Slider
                          value={[localConfig.scaleFactor || 100]}
                          onValueChange={([value]) => setLocalConfig({ ...localConfig, scaleFactor: value })}
                          min={10}
                          max={500}
                          step={10}
                          className="w-full"
                          data-testid="slider-scale"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>10% (smaller)</span>
                          <span>100% (original)</span>
                          <span>500% (larger)</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          {[50, 100, 150, 200].map((value) => (
                            <Button
                              key={value}
                              variant={localConfig.scaleFactor === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setLocalConfig({ ...localConfig, scaleFactor: value })}
                              data-testid={`button-scale-${value}`}
                            >
                              {value}%
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
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
                    )}

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
                <ImageIcon className="h-5 w-5" />
                Watermarks
              </CardTitle>
              <CardDescription>
                Add image watermarks (up to 3)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="watermark-toggle">Add Watermarks</Label>
                  <p className="text-xs text-muted-foreground">
                    Overlay images on your photos
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
                  
                  <div className="space-y-4">
                    {watermarkCount < 3 && (
                      <div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => watermarkInputRef.current?.click()}
                          data-testid="button-upload-watermark"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Watermark Image ({watermarkCount}/3)
                        </Button>
                        <input
                          ref={watermarkInputRef}
                          type="file"
                          accept="image/png,image/webp,image/gif"
                          multiple
                          className="hidden"
                          onChange={handleWatermarkUpload}
                          data-testid="input-watermark-upload"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          PNG or WebP with transparency recommended
                        </p>
                      </div>
                    )}

                    {(localConfig.watermarkImages || []).map((watermark, index) => (
                      <Card key={watermark.id} className="p-4">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                                <img 
                                  src={`/api/watermarks/${watermark.id}`} 
                                  alt={watermark.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                              <div>
                                <p className="text-sm font-medium truncate max-w-[120px]">{watermark.name}</p>
                                <p className="text-xs text-muted-foreground">Watermark {index + 1}</p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeWatermark(watermark.id)}
                              data-testid={`button-remove-watermark-${watermark.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Opacity</Label>
                              <Badge variant="outline" className="text-xs">{watermark.opacity}%</Badge>
                            </div>
                            <Slider
                              value={[watermark.opacity]}
                              onValueChange={([value]) => updateWatermark(watermark.id, { opacity: value })}
                              min={10}
                              max={100}
                              step={5}
                              className="w-full"
                              data-testid={`slider-watermark-opacity-${watermark.id}`}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs">Position</Label>
                            <Select
                              value={watermark.position}
                              onValueChange={(value) => updateWatermark(watermark.id, { 
                                position: value as WatermarkImage["position"] 
                              })}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-watermark-position-${watermark.id}`}>
                                <SelectValue />
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

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">Size</Label>
                              <Badge variant="outline" className="text-xs">{watermark.scale}%</Badge>
                            </div>
                            <Slider
                              value={[watermark.scale]}
                              onValueChange={([value]) => updateWatermark(watermark.id, { scale: value })}
                              min={5}
                              max={100}
                              step={5}
                              className="w-full"
                              data-testid={`slider-watermark-scale-${watermark.id}`}
                            />
                          </div>
                        </div>
                      </Card>
                    ))}

                    {watermarkCount === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No watermarks uploaded yet
                      </p>
                    )}
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
                      ? (localConfig.resizeMode === "scale" 
                          ? `${localConfig.scaleFactor || 100}%` 
                          : `${localConfig.width || "auto"} × ${localConfig.height || "auto"}`)
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
                  <span className="text-muted-foreground">Watermarks</span>
                  <span className="font-medium">
                    {localConfig.addWatermark ? `${watermarkCount} image(s)` : "No"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
