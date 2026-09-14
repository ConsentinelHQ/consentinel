import { auth, currentUser } from "@clerk/nextjs/server";
import { eq, orgMembers, orgs, users } from "@consentinel/db";
import { db } from "@/lib/server";

export interface Session {
  userId: string;
  orgId: string;
  role: string;
}

/**
 * Maps a Clerk session onto local rows, creating them on first sight.
 *
 * Clerk is the source of truth for identity; the local tables exist so sites and
 * scans can carry foreign keys. A user with no Clerk organisation gets a personal
 * one - a solo merchant should never have to think about "organisations" to use
 * the product, but the schema stays uniform underneath.
 */
export async function requireSession(): Promise<Session> {
  const { userId: clerkUserId, orgId: clerkOrgId, orgRole } = await auth();
  if (!clerkUserId) throw new Error("not authenticated");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const database = db();

  let [localUser] = await database
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);

  localUser ??= (await database.insert(users).values({ clerkUserId, email }).returning())[0];
  if (!localUser) throw new Error("failed to create user");

  // Personal org fallback: keyed on the Clerk user id so it is stable and unique.
  const effectiveOrgKey = clerkOrgId ?? `personal:${clerkUserId}`;
  const orgName = clerkOrgId ? (user?.username ?? "Organisation") : email || "Personal";

  let [localOrg] = await database
    .select()
    .from(orgs)
    .where(eq(orgs.clerkOrgId, effectiveOrgKey))
    .limit(1);

  localOrg ??= (
    await database.insert(orgs).values({ clerkOrgId: effectiveOrgKey, name: orgName }).returning()
  )[0];
  if (!localOrg) throw new Error("failed to create org");

  await database
    .insert(orgMembers)
    .values({
      orgId: localOrg.id,
      userId: localUser.id,
      role: clerkOrgId ? (orgRole === "org:admin" ? "admin" : "member") : "owner",
    })
    .onConflictDoNothing();

  return {
    userId: localUser.id,
    orgId: localOrg.id,
    role: orgRole ?? "owner",
  };
}
