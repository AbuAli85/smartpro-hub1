/**
 * client/src/features/controlTower/components/ControlTowerDismissDialog.tsx
 *
 * Confirmation dialog for dismissing a Control Tower item.
 * Requires a non-empty reason before allowing confirm.
 * High/critical items receive an additional warning.
 */

import React, { useState } from "react";
import type { ControlTowerSeverity } from "@shared/controlTowerTypes";

interface ControlTowerDismissDialogProps {
  open: boolean;
  severity: ControlTowerSeverity;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending?: boolean;
}

export function ControlTowerDismissDialog({
  open,
  severity,
  onClose,
  onConfirm,
  isPending = false,
}: ControlTowerDismissDialogProps) {
  const [reason, setReason] = useState("");

  if (!open) return null;

  const isHighRisk = severity === "critical" || severity === "high";
  const canConfirm = reason.trim().length > 0 && !isPending;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(reason.trim());
    setReason("");
  }

  function handleClose() {
    setReason("");
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ct-dismiss-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 id="ct-dismiss-title" className="text-base font-semibold text-gray-900">
          Dismiss signal
        </h2>

        <p className="text-sm text-gray-600">
          Dismiss this signal for 7 days. If the issue is still active after that, it may
          reappear in the Control Tower.
        </p>

        {isHighRisk && (
          <div
            role="alert"
            className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800"
          >
            This does not fix the source issue. To resolve it permanently, open the related
            module and complete the required action.
          </div>
        )}

        <div className="space-y-1">
          <label
            htmlFor="ct-dismiss-reason"
            className="block text-sm font-medium text-gray-700"
          >
            Reason <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <textarea
            id="ct-dismiss-reason"
            rows={3}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm
                       placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none
                       focus:ring-1 focus:ring-indigo-500 resize-none"
            placeholder="Briefly explain why this signal is being dismissed…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-required="true"
          />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm
                       font-medium text-gray-700 hover:bg-gray-50 focus:outline-none
                       focus:ring-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white
                       hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50
                       focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {isPending ? "Dismissing…" : "Dismiss signal"}
          </button>
        </div>
      </div>
    </div>
  );
}
