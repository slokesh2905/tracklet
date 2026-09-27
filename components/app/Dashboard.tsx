"use client";

import { useMemo, useState } from "react";
import { Download, PackageSearch, Search, SlidersHorizontal, X } from "lucide-react";
import AddProductForm from "@/components/AddProductForm";
import StatsRow from "@/components/app/StatsRow";
import ProductCard from "@/components/product/ProductCard";
import ProductCardSkeleton from "@/components/product/ProductCardSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { DashboardProduct, DashboardStats, ProductStatus } from "@/lib/data";
import type { CollectionRow } from "@/lib/db/schema";
import { isGreatDeal } from "@/lib/deals";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ value: "all" | "deals" | ProductStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "deals", label: "Great deals" },
  { value: "dropped", label: "Dropped" },
  { value: "increased", label: "Went up" },
  { value: "unchanged", label: "No change" },
  { value: "new", label: "New" },
];

const SORTS = {
  date: { label: "Newest first", fn: (a: DashboardProduct, b: DashboardProduct) => b.created_at.localeCompare(a.created_at) },
  deal: { label: "Best deal", fn: (a: DashboardProduct, b: DashboardProduct) => b.dealScore - a.dealScore },
  drop: { label: "Biggest drop", fn: (a: DashboardProduct, b: DashboardProduct) => a.percentChange - b.percentChange },
  priceAsc: { label: "Price: low to high", fn: (a: DashboardProduct, b: DashboardProduct) => a.current_price - b.current_price },
  priceDesc: { label: "Price: high to low", fn: (a: DashboardProduct, b: DashboardProduct) => b.current_price - a.current_price },
} as const;

type SortKey = keyof typeof SORTS;
type Filter = (typeof FILTERS)[number]["value"];

type Props = {
  products: DashboardProduct[];
  stats: DashboardStats;
  collections: Pick<CollectionRow, "id" | "name">[];
};

export default function Dashboard({ products, stats, collections }: Props) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [filter, setFilter] = useState<Filter>("all");
  const [collection, setCollection] = useState("all");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.url.toLowerCase().includes(q))
      .filter((p) =>
        filter === "all" ? true : filter === "deals" ? isGreatDeal(p) : p.status === filter
      )
      .filter((p) =>
        collection === "all" ? true : collection === "none" ? !p.collection_id : p.collection_id === collection
      )
      .sort(SORTS[sortBy].fn);
  }, [products, search, filter, sortBy, collection]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: products.length, deals: 0 };
    for (const p of products) {
      c[p.status] = (c[p.status] ?? 0) + 1;
      if (isGreatDeal(p)) c.deals!++;
    }
    return c;
  }, [products]);

  const activeExtras = (sortBy !== "date" ? 1 : 0) + (collection !== "all" ? 1 : 0);

  const sortAndCollection = (
    <>
      <div className="flex flex-col gap-2 md:contents">
        <Label className="md:sr-only">Sort by</Label>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-full md:w-44" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORTS).map(([key, s]) => (
              <SelectItem key={key} value={key}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {collections.length > 0 && (
        <div className="flex flex-col gap-2 md:contents">
          <Label className="md:sr-only">Collection</Label>
          <Select value={collection} onValueChange={setCollection}>
            <SelectTrigger className="w-full md:w-44" aria-label="Collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collections</SelectItem>
              <SelectItem value="none">Not in a collection</SelectItem>
              {collections.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-linear-to-br from-primary/10 via-card to-card p-4 sm:p-6">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Track a new product</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Paste a link from Amazon, Flipkart, Best Buy or almost any store.
        </p>
        <AddProductForm signedIn onAddingChange={setAdding} />
      </section>

      {products.length > 0 && <StatsRow stats={stats} />}

      {products.length === 0 && !adding ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
          <PackageSearch className="size-12 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Nothing tracked yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add your first product above. We’ll check its price daily and tell you when it’s a good time to buy.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Tracked products">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                aria-label="Search products"
                className="pl-9"
              />
            </div>

            <div className="hidden items-center gap-2 md:flex">{sortAndCollection}</div>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative shrink-0 md:hidden" aria-label="Sort and filter">
                  <SlidersHorizontal className="size-4" />
                  {activeExtras > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {activeExtras}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                <SheetHeader>
                  <SheetTitle>Sort & filter</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 px-4">{sortAndCollection}</div>
              </SheetContent>
            </Sheet>

            <Button variant="outline" size="icon" asChild className="shrink-0" aria-label="Export CSV">
              <a href="/api/export" download>
                <Download className="size-4" />
              </a>
            </Button>
          </div>

          {/* Scrolls sideways on narrow screens instead of wrapping into a tall block. */}
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Filter products">
            {FILTERS.map((f) => {
              const active = filter === f.value;
              return (
                <button
                  key={f.value}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-10 pointer-coarse:px-4",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {f.label}
                  <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{counts[f.value] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {adding && <ProductCardSkeleton reading />}
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} collections={collections} />
            ))}
          </div>

          {visible.length === 0 && !adding && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              No products match these filters.
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setCollection("all");
                }}
              >
                <X className="size-3.5" /> Clear filters
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
