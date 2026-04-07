import { toast } from "sonner";

const SKIP_WAITING = "SKIP_WAITING";

/**
 * Production-only: register SW, prompt when a new worker is waiting, reload after skipWaiting.
 * Does not implement offline mutation queueing.
 */
let reloadAfterUserAcceptedUpdate = false;

export function registerServiceWorkerWithUpdatePrompt(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloadAfterUserAcceptedUpdate) return;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        trackWaitingWorker(reg);

        if (reg.waiting && navigator.serviceWorker.controller) {
          promptUpdateAvailable(reg);
        }
      })
      .catch(() => undefined);
  });
}

let toastShownForWorker: ServiceWorker | null = null;

function trackWaitingWorker(reg: ServiceWorkerRegistration): void {
  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        promptUpdateAvailable(reg);
      }
    });
  });
}

function promptUpdateAvailable(reg: ServiceWorkerRegistration): void {
  const waiting = reg.waiting;
  if (!waiting || !navigator.serviceWorker.controller) return;
  if (toastShownForWorker === waiting) return;
  toastShownForWorker = waiting;

  toast.message("Update available", {
    description: "Reload to use the latest version.",
    duration: 120_000,
    action: {
      label: "Reload",
      onClick: () => {
        reloadAfterUserAcceptedUpdate = true;
        waiting.postMessage({ type: SKIP_WAITING });
      },
    },
  });
}
