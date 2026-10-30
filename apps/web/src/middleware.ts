import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

/**
 * Marketing pages, the public scanner, and its API stay open - the free scan is
 * the funnel mouth and must never ask for an account. Everything under /app is
 * the paid product and requires a session.
 */
const isProtected = createRouteMatcher(["/app(.*)", "/api/sites(.*)", "/api/org(.*)"]);

const clerk = clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) await auth.protect();
});

/**
 * The Shopify app runs in the admin iframe and authenticates with Shopify session
 * tokens. Clerk never sees it: a handshake redirect inside the iframe would break it.
 */
const isShopify = (path: string): boolean =>
  path === "/shopify" || path.startsWith("/shopify/") || path.startsWith("/api/shopify/");

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isShopify(request.nextUrl.pathname)) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    // Skip Next internals and static files unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
