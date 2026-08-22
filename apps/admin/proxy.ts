import { clerkMiddleware } from "@clerk/nextjs/server";

import { isPublicPath } from "./lib/publicPaths";

// Edge gate: unauthenticated requests to anything but the public routes are
// bounced to /sign-in. The allowlist is NOT checked here — page.tsx
// (requireAdmin) and actions.ts (assertAdmin) are the authoritative gates.
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicPath(req.nextUrl.pathname)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)"
  ]
};
