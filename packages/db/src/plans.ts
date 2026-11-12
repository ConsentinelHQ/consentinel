import { isEntitled, type BillingState } from "./billing.js";

/**
 * Every tier in one place. Gates read from here, never from plan names, so a
 * reprice or a new tier is a data change, not a code hunt.
 */
export type PaidPlan = "starter" | "monitoring" | "growth" | "agency";

export interface PlanSpec {
  id: PaidPlan;
  name: string;
  /** USD per month. Monitor is per site, the others are flat. */
  price: number;
  perSite: boolean;
  /** Sites a flat plan includes. Per-site plans use the subscription quantity. */
  includedSites: number;
  pagesPerScan: number;
  historyDays: number;
  externalRecipients: number;
  slack: boolean;
  teams: boolean;
  jira: boolean;
  pdfExport: boolean;
  workspaces: boolean;
  whiteLabel: boolean;
  api: boolean;
  /** Scan cadence a paid site gets. */
  schedule: "daily" | "weekly";
  /** Sold only through Shopify billing; hidden from web pricing and checkout. */
  shopifyOnly: boolean;
}

export type Feature =
  "slack" | "teams" | "jira" | "pdfExport" | "workspaces" | "whiteLabel" | "api";

export const PLANS: Readonly<Record<PaidPlan, PlanSpec>> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 19,
    perSite: true,
    includedSites: 0,
    pagesPerScan: 1,
    historyDays: 7,
    externalRecipients: 2,
    slack: false,
    teams: false,
    jira: false,
    pdfExport: false,
    workspaces: false,
    whiteLabel: false,
    api: false,
    schedule: "weekly",
    shopifyOnly: true,
  },
  monitoring: {
    id: "monitoring",
    name: "Monitor",
    price: 99,
    perSite: true,
    includedSites: 0,
    pagesPerScan: 1,
    historyDays: 30,
    externalRecipients: 10,
    slack: false,
    teams: false,
    jira: false,
    pdfExport: false,
    workspaces: false,
    whiteLabel: false,
    api: false,
    schedule: "daily",
    shopifyOnly: false,
  },
  growth: {
    id: "growth",
    name: "Growth",
    price: 299,
    perSite: false,
    includedSites: 5,
    pagesPerScan: 10,
    historyDays: 365,
    externalRecipients: 25,
    slack: true,
    teams: true,
    jira: true,
    pdfExport: true,
    workspaces: false,
    whiteLabel: false,
    api: false,
    schedule: "daily",
    shopifyOnly: false,
  },
  agency: {
    id: "agency",
    name: "Agency",
    price: 799,
    perSite: false,
    includedSites: 25,
    pagesPerScan: 10,
    historyDays: 365,
    externalRecipients: 100,
    slack: true,
    teams: true,
    jira: true,
    pdfExport: true,
    workspaces: true,
    whiteLabel: true,
    api: true,
    schedule: "daily",
    shopifyOnly: false,
  },
};

/** Plans the web billing page and Stripe checkout offer. */
export function webPlans(): PlanSpec[] {
  return Object.values(PLANS).filter((p) => !p.shopifyOnly);
}

export function isPaidPlan(plan: string): plan is PaidPlan {
  return Object.prototype.hasOwnProperty.call(PLANS, plan);
}

/** The active plan's spec, or null when nothing is entitled. */
export function activePlan(state: BillingState | null): PlanSpec | null {
  if (!state || !isEntitled(state) || !isPaidPlan(state.plan)) return null;
  return PLANS[state.plan];
}

/** Sites that can be scheduled. Quantity can raise a flat plan's limit for comps. */
export function siteLimit(state: BillingState | null): number {
  const plan = activePlan(state);
  if (!plan || !state) return 0;
  return plan.perSite ? state.planQuantity : Math.max(plan.includedSites, state.planQuantity);
}

export function can(state: BillingState | null, feature: Feature): boolean {
  return activePlan(state)?.[feature] ?? false;
}

/**
 * Pages Accessibility Monitor audits per scan. Free scans and Monitor get the
 * homepage; Growth and Agency get the plan's page budget at no extra cost.
 */
export function accessibilityPageLimit(state: BillingState | null): number {
  return activePlan(state)?.pagesPerScan ?? 1;
}

/** Free orgs can still add people; alerts only fire on paid schedules anyway. */
export function externalRecipientLimit(state: BillingState | null): number {
  return activePlan(state)?.externalRecipients ?? PLANS.monitoring.externalRecipients;
}

/** Yearly price per unit where offered: two months free versus monthly. */
export const ANNUAL_PRICES: Readonly<Partial<Record<PaidPlan, number>>> = {
  monitoring: 990,
  growth: 2990,
  agency: 7990,
};
