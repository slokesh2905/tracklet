/**
 * Neon URLs use `sslmode=require`, which pg currently upgrades to full
 * certificate verification and warns about on every cold start. Ask for
 * `verify-full` explicitly: same (strict) behaviour, no warning, and no
 * silent downgrade when pg adopts libpq semantics.
 */
export function withStrictSsl(connectionString: string) {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (mode && ["prefer", "require", "verify-ca"].includes(mode)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}
