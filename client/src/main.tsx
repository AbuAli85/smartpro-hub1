import { trpc } from "@/lib/trpc";
import "@/lib/i18n"; // Initialize i18next before rendering
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { ActiveCompanyProvider } from "./contexts/ActiveCompanyContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./index.css";
import { registerServiceWorkerWithUpdatePrompt } from "./lib/registerServiceWorkerUpdatePrompt";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Do not retry on client errors (4xx) — retrying BAD_REQUEST / FORBIDDEN is pointless
      // and causes noisy console errors when queries fire before the workspace is selected.
      retry: (failureCount, error) => {
        if (error instanceof TRPCClientError) {
          const code = (error as TRPCClientError<any>).data?.code;
          if (code === "BAD_REQUEST" || code === "FORBIDDEN" || code === "UNAUTHORIZED" || code === "NOT_FOUND") {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

/** Returns true for errors that are expected/intentional and should not appear in the console. */
function isSilentError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as any)?.data?.code;
  // FORBIDDEN errors are expected for users who lack optional permissions (e.g. KPI leaderboard).
  // UNAUTHORIZED is handled separately by redirectToLoginIfUnauthorized.
  // BAD_REQUEST with "Select a company workspace" is expected during initial load for multi-company users.
  if (code === "FORBIDDEN") return true;
  if (code === "BAD_REQUEST") return true;
  return false;
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isSilentError(error)) {
      console.error("[API Query Error]", error);
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isSilentError(error)) {
      console.error("[API Mutation Error]", error);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <ActiveCompanyProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ActiveCompanyProvider>
    </QueryClientProvider>
  </trpc.Provider>
);

registerServiceWorkerWithUpdatePrompt();
