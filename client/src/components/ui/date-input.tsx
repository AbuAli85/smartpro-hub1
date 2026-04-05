/**
 * DateInput — a cross-browser date picker that always displays DD/MM/YYYY.
 *
 * The native <input type="date"> renders the placeholder in the OS locale
 * (mm/dd/yyyy on US-locale machines).  This component wraps a hidden
 * <input type="date"> (which handles the calendar picker) with a visible
 * text overlay that always formats the selected value as DD/MM/YYYY.
 *
 * Props mirror a standard <input>:
 *   value     — YYYY-MM-DD string (HTML date value format)
 *   onChange  — receives a React.ChangeEvent<HTMLInputElement>
 *   className — forwarded to the outer wrapper
 *   disabled / min / max / id / name / required / placeholder
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value?: string;          // YYYY-MM-DD
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function toDisplay(val: string | undefined): string {
  if (!val) return "";
  // val is YYYY-MM-DD
  const [y, m, d] = val.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, disabled, min, max, id, name, required, placeholder, ...rest }, ref) => {
    const display = toDisplay(value);

    return (
      <div className={cn("relative", className)}>
        {/* Visible overlay showing DD/MM/YYYY */}
        <div
          className={cn(
            "flex h-9 w-full items-center rounded-md border border-input bg-background px-3 text-sm",
            "pointer-events-none select-none",
            disabled && "opacity-50",
            !display && "text-muted-foreground"
          )}
          aria-hidden="true"
        >
          {display || (placeholder ?? "DD/MM/YYYY")}
        </div>

        {/* Hidden native date input — full overlay for calendar picker */}
        <input
          ref={ref}
          type="date"
          id={id}
          name={name}
          value={value ?? ""}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          onChange={onChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ colorScheme: "light" }}
          {...rest}
        />
      </div>
    );
  }
);

DateInput.displayName = "DateInput";
