"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { sendTestPush, subscribePush, unsubscribePush } from "@/app/actions/push";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Support = "unsupported" | "needs-install" | "blocked" | "ready";

/** What this browser can do right now. A string, so the snapshot is stable between reads. */
function readSupport(): Support {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhones only expose push to apps added to the Home Screen, so say that instead of "unsupported".
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone ? "needs-install" : "unsupported";
  }
  return Notification.permission === "denied" ? "blocked" : "ready";
}

const subscribeNothing = () => () => {};

/** The browser wants the VAPID key as bytes, not the base64url string we store it as. */
function keyBytes(base64Url: string) {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const HINTS: Record<Exclude<Support, "ready">, string> = {
  unsupported: "This browser can't show push notifications.",
  "needs-install": "On iPhone, add Tracklet to your Home Screen first (Share → Add to Home Screen), then open it from there.",
  blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
};

/** Per-device opt in. Each browser or phone subscribes separately, so this sits outside the Save button. */
export default function PushToggle({ publicKey }: { publicKey: string }) {
  const support = useSyncExternalStore(subscribeNothing, readSupport, () => null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  // Find out whether this device is already subscribed. State is only set once the browser answers.
  useEffect(() => {
    if (support !== "ready") return;
    let cancelled = false;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        setEndpoint(sub?.endpoint ?? null);
        setChecked(true);
      })
      .catch(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [support]);

  async function turnOn() {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        toast.error("Notifications weren't allowed");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = sub.toJSON();
      const result = await subscribePush({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }, navigator.userAgent);
      if (!result.ok) {
        await sub.unsubscribe();
        toast.error(result.error);
        return;
      }
      setEndpoint(sub.endpoint);
      toast.success(result.message);
    } catch {
      toast.error("Couldn't turn on push notifications");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
      toast.success("Push alerts are off for this device");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!endpoint) return;
    setBusy(true);
    const result = await sendTestPush(endpoint);
    setBusy(false);
    if (result.ok) toast.success(result.message);
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">Push notifications</p>
        <p className="text-sm text-muted-foreground">
          {support && support !== "ready" ? HINTS[support] : "Get price alerts on this device, even when Tracklet is closed."}
        </p>
      </div>
      {support === "ready" && (
        <div className="flex shrink-0 items-center gap-3">
          {endpoint && (
            <Button type="button" variant="outline" size="sm" className="gap-2" disabled={busy} onClick={() => void test()}>
              <Send className="size-3.5" /> Send test
            </Button>
          )}
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={endpoint !== null}
            disabled={busy || !checked}
            onCheckedChange={(on) => void (on ? turnOn() : turnOff())}
            aria-label="Push notifications on this device"
          />
        </div>
      )}
    </div>
  );
}
