import { brandIcon } from "@/lib/brand-icon";

const SIZES = new Set(["192", "512", "maskable-512"]);

export function generateStaticParams() {
  return [...SIZES].map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = size.startsWith("maskable");
  return brandIcon(maskable ? 512 : Number(size), { maskable });
}
