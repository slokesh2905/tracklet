import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductCardSkeleton({ reading = false }: { reading?: boolean }) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-3 sm:p-4" aria-busy="true">
      <div className="flex gap-3">
        <Skeleton className="size-16 shrink-0 rounded-lg sm:size-20" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-6 w-2/5" />
        </div>
      </div>
      <Skeleton className="mt-3 h-8 w-full" />
      <div className="mt-2 flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      {reading && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Reading the product page…
        </p>
      )}
    </div>
  );
}
