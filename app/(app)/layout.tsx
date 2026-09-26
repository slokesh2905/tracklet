import { redirect } from "next/navigation";
import { AppHeader, MobileTabBar } from "@/components/app/AppNav";
import { createClient, getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/?signin=1");

  const supabase = await createClient();
  const { count } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return (
    <div className="min-h-dvh bg-muted/30">
      <AppHeader email={user.email ?? ""} unreadAlerts={count ?? 0} />
      {/* Bottom padding clears the mobile tab bar (4rem) plus the home-indicator inset. */}
      <main className="mx-auto max-w-6xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pt-6 md:pb-12">
        {children}
      </main>
      <MobileTabBar unreadAlerts={count ?? 0} />
    </div>
  );
}
