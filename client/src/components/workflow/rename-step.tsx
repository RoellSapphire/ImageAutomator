import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FileEdit, ArrowRight, Ban } from "lucide-react";
import type { RenameConfig, ProcessedImage } from "@/lib/types";

interface RenameStepProps {
  images: ProcessedImage[];
  config: RenameConfig;
  onConfigChange: (config: RenameConfig) => void;
  skipRename?: boolean;
  onSkipRenameChange?: (skip: boolean) => void;
}

export function RenameStep({ images, config, onConfigChange, skipRename = false, onSkipRenameChange }: RenameStepProps) {
  const [localConfig, setLocalConfig] = useState<RenameConfig>(config);

  useEffect(() => {
    onConfigChange(localConfig);
  }, [localConfig, onConfigChange]);

  const generatePreviewName = (index: number, originalName: string) => {
    if (skipRename) return originalName;
    const ext = originalName.split('.').pop() || 'png';
    const number = (localConfig.startNumber + index).toString().padStart(localConfig.padding, '0');
    return `${localConfig.prefix}${localConfig.separator}${number}.${ext}`;
  };

  const previewImages = images.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Rename Images</h2>
        <p className="text-muted-foreground mt-1">
          Configure the naming pattern for your images
        </p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="skip-rename" className="flex items-center gap-2">
                <Ban className="h-4 w-4" />
                Keep Original Names
              </Label>
              <p className="text-xs text-muted-foreground">
                Skip renaming and keep original filenames
              </p>
            </div>
            <Switch
              id="skip-rename"
              checked={skipRename}
              onCheckedChange={(checked) => onSkipRenameChange?.(checked)}
              data-testid="switch-skip-rename"
            />
          </div>
        </CardContent>
      </Card>

      <div className={`grid gap-6 lg:grid-cols-2 ${skipRename ? 'opacity-50 pointer-events-none' : ''}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileEdit className="h-5 w-5" />
              Naming Configuration
            </CardTitle>
            <CardDescription>
              Set up how your files will be renamed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prefix">Prefix Text</Label>
              <Input
                id="prefix"
                placeholder="e.g., civitai_art"
                value={localConfig.prefix}
                onChange={(e) => setLocalConfig({ ...localConfig, prefix: e.target.value })}
                data-testid="input-rename-prefix"
              />
              <p className="text-xs text-muted-foreground">
                This text will appear at the beginning of each filename
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="separator">Separator</Label>
              <div className="flex gap-2">
                {["_", "-", "."].map((sep) => (
                  <button
                    key={sep}
                    onClick={() => setLocalConfig({ ...localConfig, separator: sep })}
                    className={`px-4 py-2 rounded-md border transition-colors ${
                      localConfig.separator === sep
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input hover:bg-muted"
                    }`}
                    data-testid={`button-separator-${sep}`}
                  >
                    {sep === "_" ? "Underscore (_)" : sep === "-" ? "Dash (-)" : "Dot (.)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startNumber">Starting Number</Label>
              <Input
                id="startNumber"
                type="number"
                min={0}
                value={localConfig.startNumber}
                onChange={(e) => setLocalConfig({ ...localConfig, startNumber: parseInt(e.target.value) || 1 })}
                data-testid="input-start-number"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Number Padding</Label>
                <Badge variant="secondary">{localConfig.padding} digits</Badge>
              </div>
              <Slider
                value={[localConfig.padding]}
                onValueChange={([value]) => setLocalConfig({ ...localConfig, padding: value })}
                min={1}
                max={5}
                step={1}
                className="w-full"
                data-testid="slider-padding"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1</span>
                <span>5</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview</CardTitle>
            <CardDescription>
              See how your files will be renamed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {previewImages.length > 0 ? (
                previewImages.map((image, index) => (
                  <div
                    key={image.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                    data-testid={`preview-rename-${image.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate text-muted-foreground">
                        {image.originalName}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate text-foreground font-medium">
                        {generatePreviewName(index, image.originalName)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileEdit className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Upload images to see rename preview</p>
                </div>
              )}
              
              {images.length > 5 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  +{images.length - 5} more files will be renamed
                </p>
              )}
            </div>

            <div className="mt-6 p-4 rounded-lg bg-muted">
              <p className="text-sm font-medium mb-2">Pattern Preview</p>
              <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                {localConfig.prefix}{localConfig.separator}{"#".repeat(localConfig.padding)}.ext
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
