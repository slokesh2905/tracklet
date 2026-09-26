import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { formatPercent, formatPrice } from "@/lib/format";

export type DigestItem = {
  name: string;
  detailUrl: string;
  currentPrice: number;
  currency: string;
  weekChangePct: number;
  dealLabel: string;
};

export type WeeklyDigestEmailProps = {
  items: DigestItem[];
  dashboardUrl: string;
  settingsUrl: string;
};

const brand = "#f97316";

export default function WeeklyDigestEmail({
  items,
  dashboardUrl,
  settingsUrl,
}: WeeklyDigestEmailProps) {
  const drops = items.filter((i) => i.weekChangePct < 0).length;

  return (
    <Html>
      <Head />
      <Preview>
        {drops > 0
          ? `${drops} of your products got cheaper this week`
          : "Your weekly Tracklet summary"}
      </Preview>
      <Body style={{ backgroundColor: "#f6f6f4", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 560, padding: 28 }}>
          <Text style={{ color: brand, fontWeight: 700, fontSize: 14, letterSpacing: 0.4, margin: 0 }}>
            TRACKLET · WEEKLY
          </Text>
          <Heading as="h1" style={{ fontSize: 22, color: "#171717", margin: "12px 0 4px" }}>
            Your week in prices
          </Heading>
          <Text style={{ color: "#737373", margin: "0 0 20px", fontSize: 14 }}>
            {items.length} tracked · {drops} cheaper than last week
          </Text>

          {items.map((item) => (
            <Section key={item.detailUrl} style={{ borderTop: "1px solid #f0efed", padding: "12px 0" }}>
              <Row>
                <Column>
                  <Link href={item.detailUrl} style={{ color: "#171717", fontSize: 14, fontWeight: 600 }}>
                    {item.name.length > 70 ? `${item.name.slice(0, 67)}…` : item.name}
                  </Link>
                  <Text style={{ margin: "2px 0 0", fontSize: 12, color: "#737373" }}>
                    {item.dealLabel}
                  </Text>
                </Column>
                <Column align="right" style={{ width: 130 }}>
                  <Text style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#171717" }}>
                    {formatPrice(item.currentPrice, item.currency)}
                  </Text>
                  <Text
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: item.weekChangePct < 0 ? "#15803d" : item.weekChangePct > 0 ? "#b91c1c" : "#a3a3a3",
                    }}
                  >
                    {item.weekChangePct === 0 ? "no change" : formatPercent(item.weekChangePct, { signed: true })}
                  </Text>
                </Column>
              </Row>
            </Section>
          ))}

          <Section style={{ marginTop: 20 }}>
            <Button
              href={dashboardUrl}
              style={{ backgroundColor: brand, color: "#fff", borderRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 15 }}
            >
              Open dashboard
            </Button>
          </Section>

          <Hr style={{ borderColor: "#e7e5e4", margin: "28px 0 16px" }} />
          <Text style={{ fontSize: 12, color: "#a3a3a3", margin: 0 }}>
            <Link href={settingsUrl} style={{ color: "#a3a3a3", textDecoration: "underline" }}>
              Turn off the weekly digest
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
