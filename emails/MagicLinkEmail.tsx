import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

const brand = "#f97316";

export default function MagicLinkEmail({ url }: { url: string }) {
  return (
    <Html>
      <Head />
      <Preview>Your Tracklet sign-in link</Preview>
      <Body style={{ backgroundColor: "#f6f6f4", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 480, padding: 28 }}>
          <Text style={{ color: brand, fontWeight: 700, fontSize: 14, letterSpacing: 0.4, margin: 0 }}>TRACKLET</Text>
          <Heading as="h1" style={{ fontSize: 22, color: "#171717", margin: "12px 0 8px" }}>
            Sign in to Tracklet
          </Heading>
          <Text style={{ fontSize: 15, color: "#404040" }}>
            Click the button below to sign in. The link expires in 15 minutes and can be used once.
          </Text>
          <Button
            href={url}
            style={{ backgroundColor: brand, color: "#fff", borderRadius: 8, padding: "12px 20px", fontWeight: 600, fontSize: 15 }}
          >
            Sign in
          </Button>
          <Text style={{ fontSize: 12, color: "#a3a3a3", marginTop: 24 }}>
            If you didn’t request this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

MagicLinkEmail.PreviewProps = { url: "https://example.com/api/auth/magic-link/verify?token=abc" };
