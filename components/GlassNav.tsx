import { cn } from "@/lib/utils";

/**
 * The top navigation: a single floating glass capsule. The page shows around it and blurs
 * beneath it, which is what makes the material readable; a full-bleed bar over a white
 * page just looks like a white bar. The wrapper is click-through so only the capsule catches input.
 */
export default function GlassNav({
  children,
  width = "max-w-6xl",
  className,
}: {
  children: React.ReactNode;
  width?: string;
  className?: string;
}) {
  return (
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:px-4">
      <div
        className={cn(
          "glass pointer-events-auto mx-auto flex h-14 items-center rounded-2xl border border-glass-edge px-3 shadow-lg shadow-black/5 sm:px-4",
          width,
          className
        )}
      >
        {children}
      </div>
    </header>
  );
}
