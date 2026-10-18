import { AppHeader, MobileTabBar } from "@/components/app/AppNav";
import { getCollectionList, getUnreadAlertCount } from "@/lib/data";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, collections] = await Promise.all([getUnreadAlertCount(), getCollectionList()]);

  return (
    <div className="ambient min-h-dvh bg-muted/30">
      <AppHeader email={user.email} unreadAlerts={unread} />
      {/* Bottom padding clears the mobile tab bar (4rem) plus the home-indicator inset. The width is
          the header capsule's (max-w-6xl) plus this padding, so content lines up with its edges. */}
      <main className="mx-auto max-w-[calc(72rem+2rem)] px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pt-6 md:pb-12">
        {children}
      </main>
      <MobileTabBar unreadAlerts={unread} collections={collections} />
    </div>
  );
}
