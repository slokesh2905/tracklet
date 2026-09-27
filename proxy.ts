import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/dashboard", "/products", "/collections", "/alerts", "/settings"];

/**
 * Optimistic redirect for signed-out visitors: only checks that a session cookie
 * exists (no DB call). Pages still verify the session via requireUser().
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("signin", "1");
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/products/:path*", "/collections/:path*", "/alerts/:path*", "/settings/:path*"],
};
