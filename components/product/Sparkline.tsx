import { cn } from "@/lib/utils";

/** Tiny dependency-free step sparkline for product cards. */
export default function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) {
    return <div className={cn("h-8", className)} aria-hidden="true" />;
  }

  const w = 100;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // Each price gets an equal-width step; the last one extends to the right edge.
  const step = w / values.length;
  const y = (v: number) => h - 2 - ((v - min) / span) * (h - 4);

  let d = `M0 ${y(values[0]!)}`;
  values.slice(1).forEach((v, i) => {
    d += ` H${(i + 1) * step} V${y(v)}`;
  });
  d += ` H${w}`;

  const down = values.at(-1)! < values[0]!;
  const up = values.at(-1)! > values[0]!;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", down ? "text-success" : up ? "text-danger" : "text-muted-foreground", className)}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
