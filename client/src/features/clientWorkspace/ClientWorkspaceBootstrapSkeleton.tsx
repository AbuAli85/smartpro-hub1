import { Skeleton } from "@/components/ui/skeleton";

/** Full-page placeholder while auth or company membership list is resolving. */
export function ClientWorkspaceBootstrapSkeleton() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-[75%] max-w-xs mx-auto" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
