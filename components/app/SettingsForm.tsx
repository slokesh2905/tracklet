"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { saveSettings, testDiscordWebhook } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency";
import type { UserSettingsRow } from "@/lib/database.types";

type Props = {
  email: string;
  settings: Omit<UserSettingsRow, "user_id" | "updated_at">;
};

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsForm({ email, settings }: Props) {
  const [currency, setCurrency] = useState(settings.preferred_currency as CurrencyCode);
  const [emailAlerts, setEmailAlerts] = useState(settings.email_alerts);
  const [digest, setDigest] = useState(settings.weekly_digest);
  const [webhook, setWebhook] = useState(settings.discord_webhook_url ?? "");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startSave(async () => {
      const r = await saveSettings({
        preferredCurrency: currency,
        emailAlerts,
        weeklyDigest: digest,
        discordWebhookUrl: webhook,
      });
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <section className="rounded-xl border bg-card px-4">
        <h2 className="border-b py-3 text-sm font-semibold">Display</h2>
        <Row title="Preferred currency" description="Savings and totals are converted using daily ECB rates.">
          <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
            <SelectTrigger className="w-full sm:w-32" aria-label="Preferred currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </section>

      <section className="rounded-xl border bg-card px-4">
        <h2 className="border-b py-3 text-sm font-semibold">Notifications</h2>
        <div className="divide-y">
          <Row title="Email alerts" description={`Price alerts go to ${email}.`}>
            <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} aria-label="Email alerts" />
          </Row>
          <Row title="Weekly digest" description="A Monday summary of how your tracked prices moved.">
            <Switch checked={digest} onCheckedChange={setDigest} aria-label="Weekly digest" />
          </Row>
          <div className="flex flex-col gap-2 py-4">
            <Label htmlFor="discord">Discord webhook (optional)</Label>
            <p className="text-sm text-muted-foreground">
              Server settings → Integrations → Webhooks → New webhook → Copy URL.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="discord"
                type="url"
                inputMode="url"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={!webhook || testing}
                onClick={() =>
                  startTest(async () => {
                    const r = await testDiscordWebhook(webhook);
                    if (r.ok) toast.success(r.message);
                    else toast.error(r.error);
                  })
                }
              >
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Send test
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
