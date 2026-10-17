"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Bell, BellOff, Check, ImageOff, Mail, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAlert, setAlertRead } from "@/app/actions/alerts";
import MarkAllRead from "@/components/app/MarkAllRead";
import AlertKindIcon from "@/components/product/AlertKindIcon";
import { ALERT_COPY } from "@/lib/alerts";
import type { AlertKind } from "@/lib/db/schema";
import { DAY_MS, formatPercent, formatPrice, timeAgo } from "@/lib/format";
import { deleteWithUndo } from "@/lib/undo";
import { cn } from "@/lib/utils";

export type AlertItem = {
  id: string;
  kind: AlertKind;
  productId: string;
  productName: string | null;
  imageUrl: string | null;
  oldPrice: number | null;
  newPrice: number;
  currency: string;
  createdAt: string;
  read: boolean;
  email: boolean;
  discord: boolean;
  push: boolean;
};

const FILTERS: Array<{ value: "all" | "unread" | AlertKind; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "target_reached", label: "Target hit" },
  { value: "all_time_low", label: "Lows" },
  { value: "price_drop", label: "Drops" },
  { value: "back_in_stock", label: "Restocks" },
];

/** Width of the two revealed buttons (read + delete). */
const REVEAL = 152;

function AlertRow({
  alert,
  read,
  open,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  alert: AlertItem;
  read: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const swiped = useRef(false);
  const x = drag ?? (open ? -REVEAL : 0);
  const copy = ALERT_COPY[alert.kind];
  const change = alert.oldPrice ? ((alert.newPrice - alert.oldPrice) / alert.oldPrice) * 100 : 0;

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL }}>
        <button
          type="button"
          onClick={onToggleRead}
          className="flex w-1/2 flex-col items-center justify-center gap-1 bg-foreground/70 text-xs font-medium text-background"
        >
          <Check className="size-[1.125rem]" />
          {read ? "Unread" : "Read"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex w-1/2 flex-col items-center justify-center gap-1 bg-danger text-xs font-medium text-white"
        >
          <Trash2 className="size-[1.125rem]" />
          Delete
        </button>
      </div>

      <div
        onPointerDown={(e) => {
          // Mouse and touch both swipe; touch-action keeps vertical scrolling native.
          start.current = { x: e.clientX, base: open ? -REVEAL : 0, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!s.moved && Math.abs(dx) < 6) return;
          if (!s.moved) e.currentTarget.setPointerCapture(e.pointerId);
          s.moved = true;
          swiped.current = true;
          setDrag(Math.max(-REVEAL, Math.min(0, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (s?.moved) {
            const final = drag ?? 0;
            setDrag(null);
            onOpen(final < -REVEAL / 2.5);
          }
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        // A swipe that ends over the link must not navigate.
        onClickCapture={(e) => {
          if (swiped.current) {
            swiped.current = false;
            e.preventDefault();
            e.stopPropagation();
          } else if (open) {
            e.preventDefault();
            e.stopPropagation();
            onOpen(false);
          }
        }}
        className={cn("relative touch-pan-y select-none", read ? "bg-card" : "bg-primary/5 dark:bg-primary/10")}
        style={{ transform: `translateX(${x}px)`, transition: drag === null ? "transform var(--spring-base-duration) var(--spring-base)" : "none" }}
      >
        <Link
          href={`/products/${alert.productId}`}
          data-press="highlight"
          draggable={false}
          className="flex items-center gap-3 px-3.5 py-3 hover:bg-accent/50 sm:p-4"
        >
          <span className="relative size-[3.25rem] shrink-0">
            <span className="flex size-full items-center justify-center overflow-hidden rounded-xl border bg-white">
              {alert.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={alert.imageUrl} alt="" loading="lazy" draggable={false} className="size-full object-contain p-1" />
              ) : (
                <ImageOff className="size-4 text-muted-foreground" />
              )}
            </span>
            <span className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full bg-card ring-1 ring-border">
              <AlertKindIcon kind={alert.kind} className="size-[0.8125rem]" />
            </span>
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
              {!read && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              {copy.title}
            </p>
            <p className="truncate text-sm text-muted-foreground">{alert.productName ?? "Deleted product"}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[0.78125rem] text-muted-foreground tabular-nums">
              {alert.oldPrice !== null && alert.oldPrice !== alert.newPrice ? (
                <>
                  {formatPrice(alert.oldPrice, alert.currency)}
                  <ArrowRight className="size-[0.6875rem]" />
                  <span className="font-semibold text-foreground">{formatPrice(alert.newPrice, alert.currency)}</span>
                  {change !== 0 && (
                    <span className={cn("font-medium", change < 0 ? "text-success" : "text-danger")}>
                      {formatPercent(change, { signed: true })}
                    </span>
                  )}
                </>
              ) : (
                <span className="font-semibold text-foreground">{formatPrice(alert.newPrice, alert.currency)}</span>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 self-start text-xs text-muted-foreground">
            <span suppressHydrationWarning>{timeAgo(alert.createdAt)}</span>
            <span className="flex gap-1.5">
              {alert.email && <Mail className="size-[0.8125rem]" aria-label="Sent by email" />}
              {alert.discord && <MessageSquare className="size-[0.8125rem]" aria-label="Sent to Discord" />}
              {alert.push && <Bell className="size-[0.8125rem]" aria-label="Sent as a push notification" />}
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}

export default function AlertsList({ alerts }: { alerts: AlertItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [readOverride, setReadOverride] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const items = useMemo(
    () => alerts.filter((a) => !hidden.has(a.id)).map((a) => ({ ...a, read: readOverride[a.id] ?? a.read })),
    [alerts, hidden, readOverride]
  );
  const unread = items.filter((a) => !a.read).length;
  const match = (a: (typeof items)[number], f: (typeof FILTERS)[number]["value"]) =>
    f === "all" ? true : f === "unread" ? !a.read : a.kind === f;

  const visible = items.filter((a) => match(a, filter));
  const [now] = useState(() => Date.now());
  const groups = [
    { title: "This week", rows: visible.filter((a) => now - new Date(a.createdAt).getTime() <= 7 * DAY_MS) },
    { title: "Earlier", rows: visible.filter((a) => now - new Date(a.createdAt).getTime() > 7 * DAY_MS) },
  ].filter((g) => g.rows.length > 0);

  function toggleRead(a: (typeof items)[number]) {
    const next = !a.read;
    setReadOverride((m) => ({ ...m, [a.id]: next }));
    setOpenId(null);
    startTransition(async () => {
      const r = await setAlertRead(a.id, next);
      if (!r.ok) {
        setReadOverride((m) => ({ ...m, [a.id]: !next }));
        toast.error(r.error);
      }
    });
  }

  function remove(a: (typeof items)[number]) {
    setOpenId(null);
    const unhide = () =>
      setHidden((h) => {
        const n = new Set(h);
        n.delete(a.id);
        return n;
      });
    setHidden((h) => new Set(h).add(a.id));
    deleteWithUndo({ message: "Alert deleted", commit: () => deleteAlert(a.id), restore: unhide });
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight md:text-2xl">Alerts</h1>
          <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} new` : "All caught up"}</p>
        </div>
        {unread > 0 && <MarkAllRead />}
      </div>

      {items.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <BellOff className="size-12 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">No alerts yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            When a price hits your target or drops, it shows up here and in your inbox.
          </p>
        </section>
      ) : (
        <>
          <div className="no-scrollbar fade-x -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:mask-none md:px-0" role="tablist" aria-label="Filter alerts">
            {FILTERS.map((f) => {
              const active = filter === f.value;
              const count = items.filter((a) => match(a, f.value)).length;
              return (
                <button
                  key={f.value}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium pointer-coarse:h-10 pointer-coarse:px-3.5",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{count}</span>
                </button>
              );
            })}
          </div>

          {groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h2 className="mb-2 ml-1 text-[0.8125rem] font-semibold text-muted-foreground">{g.title}</h2>
              <ul className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card md:rounded-xl">
                {g.rows.map((a) => (
                  <li key={a.id}>
                    <AlertRow
                      alert={a}
                      read={a.read}
                      open={openId === a.id}
                      onOpen={(o) => setOpenId(o ? a.id : openId === a.id ? null : openId)}
                      onToggleRead={() => toggleRead(a)}
                      onDelete={() => remove(a)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {groups.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <BellOff className="size-9 text-muted-foreground" />
              <p className="mt-1.5 text-[0.9375rem] font-semibold">Nothing here</p>
              <p className="text-[0.8125rem] text-muted-foreground">Alerts that match this filter show up here.</p>
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">Swipe left on an alert to mark it read or delete it</p>
        </>
      )}
    </div>
  );
}
