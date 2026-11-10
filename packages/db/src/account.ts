import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { orgMembers, orgs, users } from "./schema.js";

/** Pause or resume everything the org pays for. Data is untouched either way. */
export async function setOrgArchived(
  db: Database,
  orgId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(orgs)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(orgs.id, orgId));
}

export interface UserOrg {
  orgId: string;
  clerkOrgId: string;
  name: string;
  stripeSubscriptionId: string | null;
  /** Members including this user. 1 means the org goes when the user does. */
  memberCount: number;
}

export async function listUserOrgs(db: Database, userId: string): Promise<UserOrg[]> {
  return db
    .select({
      orgId: orgs.id,
      clerkOrgId: orgs.clerkOrgId,
      name: orgs.name,
      stripeSubscriptionId: orgs.stripeSubscriptionId,
      memberCount: sql<number>`(select count(*)::int from ${orgMembers} m where m.org_id = ${orgs.id})`,
    })
    .from(orgMembers)
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId));
}

/** Removes the org and, through cascades, its sites, scans, findings and integrations. */
export async function deleteOrg(db: Database, orgId: string): Promise<void> {
  await db.delete(orgs).where(eq(orgs.id, orgId));
}

/** Removes the local user and their memberships. Clerk is handled by the caller. */
export async function deleteUserRow(db: Database, userId: string): Promise<void> {
  await db.delete(orgMembers).where(and(eq(orgMembers.userId, userId)));
  await db.delete(users).where(eq(users.id, userId));
}
