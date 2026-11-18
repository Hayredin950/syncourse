/**
 * Premium plans and the one piece of arithmetic both activators share.
 *
 * Admin approval and the provider webhook used to compute expiry separately;
 * when their plan ids drifted, every plan silently granted 30 days. Keeping the
 * mapping here means a new plan cannot be cheap in one path and wrong in the
 * other, and the math is testable without a database.
 */
export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  priceEtb: number;
  priceUsd: number;
  weeklyEtb: number;
  isBestValue: boolean;
}

export const PLANS: Plan[] = [
  { id: '1m', name: '1 Month', durationDays: 30, priceEtb: 149, priceUsd: 1.99, weeklyEtb: 35, isBestValue: false },
  { id: '3m', name: '3 Months', durationDays: 90, priceEtb: 349, priceUsd: 3.99, weeklyEtb: 27, isBestValue: false },
  { id: '6m', name: '6 Months', durationDays: 182, priceEtb: 549, priceUsd: 5.99, weeklyEtb: 21, isBestValue: true },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function planForId(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

/**
 * Premium is additive: buying while still active extends the existing end
 * date rather than replacing it. An expired (or absent) end date starts from
 * now, so a lapsed member is not charged for the gap.
 */
export function premiumExpiresAt(
  currentExpiry: Date | null | undefined,
  planId: string | null | undefined,
  now = new Date(),
): Date {
  const days = planForId(planId)?.durationDays ?? 30;
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + days * DAY_MS);
}
