import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, images, the cron API and public share pages.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|api/cron|p/|c/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
