import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Upload, FileEdit, ImageIcon, FolderOpen, Globe, CheckCircle, Circle, Loader2, AlertCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowStep {
  id: number;
  title: string;
  description: string;
  status: "pending" | "active" | "completed" | "error";
}

interface AppSidebarProps {
  steps: WorkflowStep[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
}

const stepIcons = {
  1: Upload,
  2: FileEdit,
  3: ImageIcon,
  4: FolderOpen,
  5: Globe,
};

export function AppSidebar({ steps, currentStep, onStepClick }: AppSidebarProps) {
  const getStatusIcon = (step: WorkflowStep) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "active":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStepIcon = (stepId: number) => {
    const Icon = stepIcons[stepId as keyof typeof stepIcons] || Circle;
    return Icon;
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">Civitai Flow</h1>
            <p className="text-xs text-muted-foreground">Image Workflow Automation</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wide">Workflow Steps</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {steps.map((step) => {
                const StepIcon = getStepIcon(step.id);
                const isClickable = step.id <= currentStep || step.status === "completed";
                
                return (
                  <SidebarMenuItem key={step.id}>
                    <SidebarMenuButton
                      onClick={() => isClickable && onStepClick(step.id)}
                      className={cn(
                        "group relative",
                        step.status === "active" && "bg-sidebar-accent",
                        !isClickable && "opacity-50 cursor-not-allowed"
                      )}
                      data-testid={`sidebar-step-${step.id}`}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                          step.status === "active" && "border-primary bg-primary/10",
                          step.status === "completed" && "border-green-500 bg-green-500/10",
                          step.status === "error" && "border-destructive bg-destructive/10",
                          step.status === "pending" && "border-muted-foreground/30"
                        )}>
                          <StepIcon className={cn(
                            "h-4 w-4",
                            step.status === "active" && "text-primary",
                            step.status === "completed" && "text-green-500",
                            step.status === "error" && "text-destructive",
                            step.status === "pending" && "text-muted-foreground"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              "font-medium text-sm truncate",
                              step.status === "active" && "text-foreground",
                              step.status === "pending" && "text-muted-foreground"
                            )}>
                              {step.title}
                            </span>
                            {getStatusIcon(step)}
                          </div>
                          <span className="text-xs text-muted-foreground truncate block">
                            {step.description}
                          </span>
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground text-center">
          Step {currentStep} of {steps.length}
        </div>
        <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
