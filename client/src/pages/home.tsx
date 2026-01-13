import { useState, useCallback } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkflowContainer } from "@/components/workflow/workflow-container";
import { WORKFLOW_STEPS } from "@/lib/types";

interface StepState {
  id: number;
  title: string;
  description: string;
  status: "pending" | "active" | "completed" | "error";
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<StepState[]>(
    WORKFLOW_STEPS.map((step, index) => ({
      ...step,
      status: index === 0 ? "active" : "pending",
    }))
  );

  const handleStepClick = useCallback((stepId: number) => {
    setCurrentStep(stepId);
    setSteps(prev => prev.map(step => ({
      ...step,
      status: step.id === stepId ? "active" : 
              step.id < stepId ? "completed" : 
              "pending",
    })));
  }, []);

  const handleStepComplete = useCallback((stepId: number) => {
    setSteps(prev => prev.map(step => ({
      ...step,
      status: step.id === stepId ? "completed" : step.status,
    })));
  }, []);

  const handleStepChange = useCallback((stepId: number) => {
    setCurrentStep(stepId);
    setSteps(prev => prev.map(step => ({
      ...step,
      status: step.id === stepId ? "active" : 
              step.id < stepId ? "completed" : 
              "pending",
    })));
  }, []);

  const sidebarStyle = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <AppSidebar 
          steps={steps} 
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
        <SidebarInset className="flex flex-col flex-1">
          <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <span className="text-sm font-medium text-muted-foreground">
                {steps.find(s => s.id === currentStep)?.title}
              </span>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-hidden">
            <WorkflowContainer 
              currentStep={currentStep}
              onStepChange={handleStepChange}
              onStepComplete={handleStepComplete}
            />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
