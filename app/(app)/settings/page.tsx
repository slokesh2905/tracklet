import SettingsForm from "@/components/app/SettingsForm";
import { getSettings } from "@/lib/data";
import { getUser } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [user, settings] = await Promise.all([getUser(), getSettings()]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">How Tracklet shows prices and reaches you.</p>
      </div>
      <SettingsForm
        email={user?.email ?? ""}
        settings={{
          preferred_currency: settings.preferred_currency,
          email_alerts: settings.email_alerts,
          weekly_digest: settings.weekly_digest,
          discord_webhook_url: settings.discord_webhook_url,
        }}
      />
    </div>
  );
}
