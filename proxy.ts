import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/home", "/dashboard", "/products", "/collections", "/alerts", "/settings", "/share"];

/**
 * Optimistic redirect for signed-out visitors: only checks that a session cookie
 * exists (no DB call). Pages still verify the session via requireUser().
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    // Keep the query: a shared link travels in it and must survive signing in.
    const next = pathname + request.nextUrl.search;
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("signin", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/home/:path*", "/dashboard/:path*", "/products/:path*", "/collections/:path*", "/alerts/:path*", "/settings/:path*", "/share/:path*"],
};
