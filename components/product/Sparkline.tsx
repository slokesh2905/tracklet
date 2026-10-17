import { cn } from "@/lib/utils";

/** Tiny dependency-free step sparkline for product cards. */
export default function Sparkline({
  values,
  dot = false,
  className,
}: {
  values: number[];
  /** The phone card's 64×24 version: undistorted, with today's price as a dot at the end. */
  dot?: boolean;
  className?: string;
}) {
  if (dot && values.length > 0) return <DotSparkline values={values} className={className} />;
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

function DotSparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 64;
  const h = 24;
  const v = values.length > 1 ? values : [values[0]!, values[0]!];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const y = (p: number) => (max === min ? h / 2 : 3 + (1 - (p - min) / (max - min)) * (h - 6));
  const x = (i: number) => (i / (v.length - 1)) * (w - 4);
  const points: string[] = [];
  v.forEach((p, i) => {
    if (i > 0) points.push(`${x(i).toFixed(1)},${y(v[i - 1]!).toFixed(1)}`);
    points.push(`${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  });

  const down = v.at(-1)! < v[0]!;
  const up = v.at(-1)! > v[0]!;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-6 w-15 overflow-visible", down ? "text-success" : up ? "text-danger" : "text-muted-foreground", className)}
      aria-hidden="true"
    >
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(v.length - 1)} cy={y(v.at(-1)!)} r="2.5" fill="currentColor" />
    </svg>
  );
}
