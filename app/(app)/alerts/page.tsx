import AlertsList, { type AlertItem } from "@/components/app/AlertsList";
import { getAlerts } from "@/lib/data";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const alerts = await getAlerts();

  const items: AlertItem[] = alerts.map((a) => ({
    id: a.id,
    kind: a.kind,
    productId: a.product_id,
    productName: a.product?.name ?? null,
    imageUrl: a.product?.image_url ?? null,
    oldPrice: a.old_price === null ? null : Number(a.old_price),
    newPrice: Number(a.new_price),
    currency: a.currency,
    createdAt: a.created_at,
    read: !!a.read_at,
    email: a.channels.includes("email"),
    discord: a.channels.includes("discord"),
  }));

  return <AlertsList alerts={items} />;
}
