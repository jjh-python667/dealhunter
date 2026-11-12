import { isExpired } from "../extract";
import type { DealRecord } from "../types";

export type FeaturedSelection = {
  /** The single story of the day, or null when evidence is too thin. */
  primary: DealRecord | null;
  /** Two or three supporting picks, never repeating the primary or each other. */
  secondary: DealRecord[];
};

/**
 * How much of a deal is written down in the source itself. A deal only becomes a
 * featured pick when the collector (not the editor) can point at concrete facts.
 */
export function evidenceStrength(deal: DealRecord, now: Date): number {
  let score = 0;
  if (deal.valueText.trim()) score += 2;
  if (deal.valueTier === "money" || deal.valueTier === "money_other") score += 1;
  if (deal.conditions.trim()) score += 1;
  if (deal.regions.trim()) score += 1;
  if (deal.endsAt) score += 1;
  if (deal.steps.trim()) score += 1;
  if (deal.lastVerifiedAt && now.getTime() - Date.parse(deal.lastVerifiedAt) < 7 * 24 * 60 * 60 * 1000) score += 1;
  return score;
}

function dayStamp(deal: DealRecord): number {
  const value = deal.publishedAt ?? deal.firstSeenAt;
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Evidence-first editorial selection: still-valid deals only, strongest written
 * evidence first, then source value, then recency. Secondary picks prefer varied
 * categories so the homepage does not show three cloud hosts in a row.
 * An empty selection is a valid result — the caller must not invent a pick.
 */
export function selectFeatured(deals: DealRecord[], now: Date, options: { secondary?: number } = {}): FeaturedSelection {
  const limit = Math.max(0, Math.min(3, options.secondary ?? 3));
  const candidates = deals
    .filter(deal => deal.status === "active" && !isExpired(deal.endsAt, now))
    .map(deal => ({ deal, strength: evidenceStrength(deal, now) }))
    .filter(entry => entry.strength >= 4)
    .sort((a, b) => b.strength - a.strength || b.deal.rankScore - a.deal.rankScore || dayStamp(b.deal) - dayStamp(a.deal) || a.deal.id.localeCompare(b.deal.id));
  if (!candidates.length) return { primary: null, secondary: [] };
  const [first, ...rest] = candidates;
  const primary = first!.deal;
  const seen = new Set([primary.id]);
  const seenCategories = new Set([primary.category]);
  const secondary: DealRecord[] = [];
  // First pass: one pick per category, so the row feels varied.
  for (const entry of rest) {
    if (secondary.length >= limit) break;
    if (seen.has(entry.deal.id) || seenCategories.has(entry.deal.category)) continue;
    seen.add(entry.deal.id);
    seenCategories.add(entry.deal.category);
    secondary.push(entry.deal);
  }
  // Second pass: fill the remaining slots when only a few categories qualify.
  for (const entry of rest) {
    if (secondary.length >= limit) break;
    if (seen.has(entry.deal.id)) continue;
    seen.add(entry.deal.id);
    secondary.push(entry.deal);
  }
  return { primary, secondary };
}
