/**
 * client/src/features/controlTower/components/ControlTowerHelpPanel.tsx
 *
 * Informational panel explaining where Control Tower signals come from and
 * how resolution works.  Shown via a toggleable help button on the page.
 */

import React from "react";

interface ControlTowerHelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ControlTowerHelpPanel({ open, onClose }: ControlTowerHelpPanelProps) {
  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="Control Tower help"
      className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-3 text-sm text-blue-900"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-blue-900">About Control Tower signals</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help panel"
          className="text-blue-600 hover:text-blue-800 focus:outline-none"
        >
          &#x2715;
        </button>
      </div>

      <p>
        Control Tower shows live signals from <strong>payroll</strong>, <strong>HR</strong>,{" "}
        <strong>compliance</strong>, <strong>operations</strong>, <strong>finance</strong>,{" "}
        <strong>documents</strong>, and <strong>contracts</strong>. Signals appear automatically
        when a condition requires your attention — no manual entry needed.
      </p>

      <ul className="list-disc list-inside space-y-1 text-blue-800">
        <li>
          <strong>Acknowledge</strong> — confirm you have seen the signal. It stays open until
          resolved or dismissed.
        </li>
        <li>
          <strong>Open related</strong> — navigate to the source module to fix the underlying
          issue. This is the recommended first action for system-generated signals.
        </li>
        <li>
          <strong>Resolve</strong> — mark the issue as fixed. Only available once the source
          condition has cleared.
        </li>
        <li>
          <strong>Dismiss</strong> — hide the signal for 7 days with a mandatory reason. If the
          source issue persists, the signal may reappear automatically.
        </li>
      </ul>

      <p className="text-blue-700">
        Some signals can only be permanently resolved by fixing the source record (e.g. approving
        a payroll run, renewing a document, or completing a contract signature).
      </p>
    </aside>
  );
}
