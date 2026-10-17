import { redirect } from "next/navigation";
import Dashboard from "@/components/app/Dashboard";
import { getDashboardData } from "@/lib/data";

export const metadata = { title: "Products" };

type SearchParams = Promise<{ collection?: string; filter?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const [data, params] = await Promise.all([getDashboardData(), searchParams]);
  if (!data) redirect("/?signin=1");

  return (
    <Dashboard
      products={data.products}
      stats={data.stats}
      collections={data.collections.map(({ id, name }) => ({ id, name }))}
      initialCollection={params.collection}
      initialFilter={params.filter}
    />
  );
}
