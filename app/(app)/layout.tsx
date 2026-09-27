import { AppHeader, MobileTabBar } from "@/components/app/AppNav";
import { getUnreadAlertCount } from "@/lib/data";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await getUnreadAlertCount();

  return (
    <div className="min-h-dvh bg-muted/30">
      <AppHeader email={user.email} unreadAlerts={unread} />
      {/* Bottom padding clears the mobile tab bar (4rem) plus the home-indicator inset. */}
      <main className="mx-auto max-w-6xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pt-6 md:pb-12">
        {children}
      </main>
      <MobileTabBar unreadAlerts={unread} />
    </div>
  );
}
