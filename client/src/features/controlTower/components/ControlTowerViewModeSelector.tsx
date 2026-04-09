import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ControlTowerViewMode } from "../presentationMode";

export type ControlTowerViewModeSelectorProps = {
  value: ControlTowerViewMode;
  onChange: (mode: ControlTowerViewMode) => void;
  disabled?: boolean;
  className?: string;
};

const MODES: { id: ControlTowerViewMode; label: string }[] = [
  { id: "operate", label: "Operate" },
  { id: "brief", label: "Brief" },
  { id: "present", label: "Present" },
];

export function ControlTowerViewModeSelector({
  value,
  onChange,
  disabled,
  className,
}: ControlTowerViewModeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Control Tower view mode"
      className={cn("inline-flex rounded-md border border-input bg-muted/25 p-0.5 gap-0.5", className)}
    >
      {MODES.map((m) => (
        <Button
          key={m.id}
          type="button"
          variant={value === m.id ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-[11px] font-medium"
          aria-pressed={value === m.id}
          disabled={disabled}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </Button>
      ))}
    </div>
  );
}
