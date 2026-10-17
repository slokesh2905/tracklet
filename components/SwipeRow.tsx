"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SwipeAction = {
  label: string;
  icon: LucideIcon;
  /** Background and text colour of the revealed button. */
  className: string;
  onClick: () => void;
};

/** Width of each revealed button. */
const ACTION_WIDTH = 76;

type Props = {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Return false to ignore a swipe (e.g. on desktop, where a menu does the job). */
  enabled?: () => boolean;
  /** Classes for the sliding layer: its background must be opaque to hide the actions. */
  className?: string;
  /** Classes for the outer clip, e.g. a border radius. */
  frameClassName?: string;
  /** Classes for the actions strip, e.g. to hide it where swiping is off. */
  actionsClassName?: string;
  children: React.ReactNode;
};

/**
 * Swipe left to reveal actions, as in iOS lists. Mouse and touch both drag; touch-action keeps
 * vertical scrolling native, and a swipe that ends over a link does not follow it.
 */
export default function SwipeRow({ actions, open, onOpenChange, enabled, className, frameClassName, actionsClassName, children }: Props) {
  const reveal = actions.length * ACTION_WIDTH;
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const swiped = useRef(false);
  const x = drag ?? (open ? -reveal : 0);

  return (
    <div className={cn("relative overflow-hidden", frameClassName)}>
      {/* Hidden at rest so their colour can't show through the row's anti-aliased rounded corners;
          the delay lets a closing row finish sliding back first. */}
      <div
        className={cn("absolute inset-y-0 right-0 flex", x === 0 && "invisible [transition:visibility_0s_linear_var(--spring-base-duration)]", actionsClassName)}
        style={{ width: reveal }}
        aria-hidden={!open}
      >
        {actions.map(({ label, icon: Icon, className: tone, onClick }) => (
          <button
            key={label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={onClick}
            className={cn("flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center text-xs leading-tight font-medium", tone)}
          >
            <Icon className="size-[1.125rem]" />
            {label}
          </button>
        ))}
      </div>

      <div
        onPointerDown={(e) => {
          if (enabled && !enabled()) return;
          swiped.current = false;
          start.current = { x: e.clientX, base: open ? -reveal : 0, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!s.moved && Math.abs(dx) < 6) return;
          if (!s.moved) e.currentTarget.setPointerCapture(e.pointerId);
          s.moved = true;
          swiped.current = true;
          setDrag(Math.max(-reveal, Math.min(0, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (s?.moved) {
            const final = drag ?? 0;
            setDrag(null);
            onOpenChange(final < -reveal / 2.5);
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onClickCapture={(e) => {
          // Every click that a swipe produces is swallowed, until the next press.
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
          } else if (open) {
            // A tap on an open row closes it instead of opening the product.
            e.preventDefault();
            e.stopPropagation();
            onOpenChange(false);
          }
        }}
        className={cn("relative touch-pan-y select-none", className)}
        style={{ transform: `translateX(${x}px)`, transition: drag === null ? "transform var(--spring-base-duration) var(--spring-base)" : "none" }}
      >
        {children}
      </div>
    </div>
  );
}
