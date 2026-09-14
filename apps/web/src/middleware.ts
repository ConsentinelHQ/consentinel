import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Marketing pages, the public scanner, and its API stay open - the free scan is
 * the funnel mouth and must never ask for an account. Everything under /app is
 * the paid product and requires a session.
 */
const isProtected = createRouteMatcher(["/app(.*)", "/api/sites(.*)", "/api/org(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
