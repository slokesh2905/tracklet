// Mirrors supabase/migrations. Regenerate with `npm run db:types` once linked to a project.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Rel<
  Column extends string,
  Target extends string,
  OneToOne extends boolean = false,
> = {
  foreignKeyName: string;
  columns: [Column];
  isOneToOne: OneToOne;
  referencedRelation: Target;
  referencedColumns: ["id"];
};

type Table<
  Row,
  Required extends keyof Row,
  Relationships extends Rel<string, string, boolean>[] = [],
> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type CollectionRow = {
  id: string;
  user_id: string;
  name: string;
  is_public: boolean;
  share_slug: string;
  created_at: string;
};

export type ProductRow = {
  id: string;
  user_id: string;
  url: string;
  name: string;
  current_price: number;
  original_price: number | null;
  currency: string;
  image_url: string | null;
  in_stock: boolean;
  category: string | null;
  collection_id: string | null;
  target_price: number | null;
  alert_pct: number | null;
  lowest_price: number | null;
  highest_price: number | null;
  is_public: boolean;
  share_slug: string;
  last_checked_at: string | null;
  last_error: string | null;
  fail_count: number;
  paused: boolean;
  created_at: string;
  updated_at: string;
};

export type PriceHistoryRow = {
  id: string;
  product_id: string;
  price: number;
  currency: string;
  in_stock: boolean | null;
  checked_at: string;
};

export type AlertKind =
  | "target_reached"
  | "price_drop"
  | "all_time_low"
  | "back_in_stock";

export type AlertRow = {
  id: string;
  user_id: string;
  product_id: string;
  kind: AlertKind;
  old_price: number | null;
  new_price: number;
  currency: string;
  channels: string[];
  read_at: string | null;
  created_at: string;
};

export type UserSettingsRow = {
  user_id: string;
  preferred_currency: string;
  email_alerts: boolean;
  weekly_digest: boolean;
  discord_webhook_url: string | null;
  updated_at: string;
};

export type Verdict = "buy_now" | "wait" | "fair";

export type ProductInsightRow = {
  product_id: string;
  verdict: Verdict;
  confidence: number;
  summary: string;
  reasons: Json;
  price_at_generation: number;
  model: string;
  generated_at: string;
};

export type AiUsageRow = {
  user_id: string;
  day: string;
  calls: number;
};

export type CheckRunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  products_checked: number;
  urls_scraped: number;
  price_changes: number;
  alerts_sent: number;
  failures: number;
  duration_ms: number | null;
};

export type Database = {
  public: {
    Tables: {
      collections: Table<CollectionRow, "name">;
      products: Table<
        ProductRow,
        "url" | "name" | "current_price",
        [Rel<"collection_id", "collections">]
      >;
      price_history: Table<
        PriceHistoryRow,
        "product_id" | "price" | "currency",
        [Rel<"product_id", "products">]
      >;
      alerts: Table<
        AlertRow,
        "user_id" | "product_id" | "kind" | "new_price" | "currency",
        [Rel<"product_id", "products">]
      >;
      user_settings: Table<UserSettingsRow, never>;
      product_insights: Table<
        ProductInsightRow,
        | "product_id"
        | "verdict"
        | "confidence"
        | "summary"
        | "price_at_generation"
        | "model",
        [Rel<"product_id", "products", true>]
      >;
      ai_usage: Table<AiUsageRow, "user_id">;
      check_runs: Table<CheckRunRow, never>;
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_ai_quota: { Args: { daily_limit: number }; Returns: boolean };
      get_shared_product: { Args: { slug: string }; Returns: Json };
      get_shared_collection: { Args: { slug: string }; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
