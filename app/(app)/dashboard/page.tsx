import { redirect } from "next/navigation";
import Dashboard from "@/components/app/Dashboard";
import { getDashboardData } from "@/lib/data";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const data = await getDashboardData();
  if (!data) redirect("/?signin=1");

  return (
    <Dashboard
      products={data.products}
      stats={data.stats}
      collections={data.collections.map(({ id, name }) => ({ id, name }))}
    />
  );
}
