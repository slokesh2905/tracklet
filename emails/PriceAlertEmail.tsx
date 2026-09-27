import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { AlertKind } from "@/lib/db/schema";
import { ALERT_COPY } from "@/lib/alerts";
import { formatPercent, formatPrice, percentChange } from "@/lib/format";

export type PriceAlertEmailProps = {
  kind: AlertKind;
  productName: string;
  productUrl: string;
  imageUrl: string | null;
  oldPrice: number;
  newPrice: number;
  currency: string;
  detailUrl: string;
  settingsUrl: string;
};

const brand = "#f97316";

export default function PriceAlertEmail({
  kind,
  productName,
  productUrl,
  imageUrl,
  oldPrice,
  newPrice,
  currency,
  detailUrl,
  settingsUrl,
}: PriceAlertEmailProps) {
  const copy = ALERT_COPY[kind];
  const change = percentChange(oldPrice, newPrice);
  const saved = oldPrice - newPrice;

  return (
    <Html>
      <Head />
      <Preview>
        {`${copy.emoji} ${copy.title}: ${productName} is now ${formatPrice(newPrice, currency)}`}
      </Preview>
      <Body style={{ backgroundColor: "#f6f6f4", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 520, padding: 28 }}>
          <Text style={{ color: brand, fontWeight: 700, fontSize: 14, letterSpacing: 0.4, margin: 0 }}>
            TRACKLET
          </Text>
          <Heading as="h1" style={{ fontSize: 22, color: "#171717", margin: "12px 0 20px" }}>
            {copy.emoji} {copy.title}
          </Heading>

          {imageUrl && (
            <Section style={{ textAlign: "center", marginBottom: 16 }}>
              <Img src={imageUrl} alt="" width={160} style={{ margin: "0 auto", borderRadius: 8 }} />
            </Section>
          )}

          <Text style={{ fontSize: 16, color: "#262626", fontWeight: 600, margin: "0 0 12px" }}>
            {productName}
          </Text>

          <Section style={{ backgroundColor: "#fafaf9", borderRadius: 10, padding: "14px 18px" }}>
            <Text style={{ margin: 0, fontSize: 13, color: "#737373" }}>Now</Text>
            <Text style={{ margin: "2px 0 8px", fontSize: 28, fontWeight: 700, color: "#171717" }}>
              {formatPrice(newPrice, currency)}
            </Text>
            {oldPrice !== newPrice && (
              <Text style={{ margin: 0, fontSize: 14, color: "#525252" }}>
                was <s>{formatPrice(oldPrice, currency)}</s>
                {saved > 0 && (
                  <span style={{ color: "#15803d", fontWeight: 600 }}>
                    {"  "}· you save {formatPrice(saved, currency)} ({formatPercent(change)})
                  </span>
                )}
              </Text>
            )}
          </Section>

          <Section style={{ marginTop: 24 }}>
            <Button
              href={productUrl}
              style={{ backgroundColor: brand, color: "#fff", borderRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 15 }}
            >
              View on store
            </Button>
            <Link href={detailUrl} style={{ marginLeft: 16, color: brand, fontSize: 14 }}>
              See price history →
            </Link>
          </Section>

          <Hr style={{ borderColor: "#e7e5e4", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, color: "#a3a3a3", margin: 0 }}>
            You’re getting this because you track this product on Tracklet.{" "}
            <Link href={settingsUrl} style={{ color: "#a3a3a3", textDecoration: "underline" }}>
              Manage notifications
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

PriceAlertEmail.PreviewProps = {
  kind: "target_reached",
  productName: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
  productUrl: "https://example.com",
  imageUrl: null,
  oldPrice: 399.99,
  newPrice: 298,
  currency: "USD",
  detailUrl: "https://example.com",
  settingsUrl: "https://example.com",
} satisfies PriceAlertEmailProps;
