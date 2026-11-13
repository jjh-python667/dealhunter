import { offerEvidence, offerRevision } from "./content/evidence";
import type { DealRecord } from "./types";
import { sha256Hex } from "./url";

export const FEEDBACK_VOTES = ["works", "expired", "unknown"] as const;
export type FeedbackVote = (typeof FEEDBACK_VOTES)[number];

/** Public aggregate window: only the last 72 hours count. */
export const FEEDBACK_WINDOW_MS = 72 * 60 * 60 * 1000;
/** Same-browser burst limit: 3 submissions per 10 minutes. */
export const FEEDBACK_RATE_WINDOW_MS = 10 * 60 * 1000;
export const FEEDBACK_RATE_WINDOW_MAX = 3;
/** Same-browser daily limit: 10 submissions per 24 hours. */
export const FEEDBACK_DAILY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_DAILY_MAX = 10;
/**
 * Network-layer limits stop a visitor from resetting the browser id to vote
 * again. They are deliberately looser than the browser limits because many
 * legitimate visitors share one office/school network.
 */
export const FEEDBACK_NETWORK_WINDOW_MS = 10 * 60 * 1000;
export const FEEDBACK_NETWORK_WINDOW_MAX = 10;
export const FEEDBACK_NETWORK_DAILY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_NETWORK_DAILY_MAX = 60;
/** Kept for the operator; a cleanup job may delete older rows later. */
export const FEEDBACK_RETENTION_DAYS = 30;

/** Positive public hint needs this many distinct browsers ... */
export const PUBLIC_WORKS_MIN_BROWSERS = 3;
/** ... and this many short-lived network groups. */
export const PUBLIC_WORKS_MIN_NETWORKS = 2;
/** Two different network groups reporting "expired" pause the positive hint. */
export const PUBLIC_EXPIRED_CONFLICT_NETWORKS = 2;

export const FEEDBACK_REVIEW_STATUSES = ["pending", "kept", "held", "hidden"] as const;
export type FeedbackReviewStatus = (typeof FEEDBACK_REVIEW_STATUSES)[number];

export function isFeedbackVote(value: unknown): value is FeedbackVote {
  return typeof value === "string" && (FEEDBACK_VOTES as readonly string[]).includes(value);
}

export function isFeedbackBrowserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(value);
}

/** offerRevision() is a short base36 hash; keep the check strict but future-proof. */
export function isFeedbackTermsVersion(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]{1,40}$/.test(value);
}

export function isFeedbackReviewStatus(value: unknown): value is FeedbackReviewStatus {
  return typeof value === "string" && (FEEDBACK_REVIEW_STATUSES as readonly string[]).includes(value);
}

/** The terms version already used by the UI for "条款变化" detection. */
export function dealTermsVersion(deal: DealRecord): string {
  return offerRevision(deal, offerEvidence(deal));
}

export function feedbackWindowStart(now: Date): string {
  return new Date(now.getTime() - FEEDBACK_WINDOW_MS).toISOString();
}

/**
 * Browser hash is stable (same browser, same deal version → one vote forever),
 * while the network hash rotates daily so it can only be used for short-lived
 * grouping, never as a long-term identifier. Both are keyed with
 * FEEDBACK_PEPPER in production; the public fallback is only for local dev.
 */
export async function feedbackHashes(input: {
  browserId: string;
  networkKey: string;
  now: Date;
  pepper?: string;
}): Promise<{ browserHash: string; networkHash: string }> {
  const day = input.now.toISOString().slice(0, 10);
  const pepper = (input.pepper ?? "").trim();
  const salt = pepper ? `dealhunter-feedback-v2|${pepper}` : "dealhunter-feedback-v1-dev";
  const browserHash = await sha256Hex(`browser|${input.browserId}|${salt}`);
  const networkHash = await sha256Hex(`network|${day}|${input.networkKey.slice(0, 80)}|${salt}`);
  return { browserHash, networkHash };
}

export type FeedbackAggregateRow = {
  vote: string;
  total: number;
  browsers: number;
  networks: number;
  last_at: string | null;
};

export type FeedbackDisplay = "none" | "positive" | "conflict";

export type FeedbackSummary = {
  works: number;
  expired: number;
  unknown: number;
  total: number;
  lastAt: string | null;
  worksBrowsers: number;
  worksNetworks: number;
  expiredNetworks: number;
  display: FeedbackDisplay;
};

export const EMPTY_FEEDBACK: FeedbackSummary = {
  works: 0,
  expired: 0,
  unknown: 0,
  total: 0,
  lastAt: null,
  worksBrowsers: 0,
  worksNetworks: 0,
  expiredNetworks: 0,
  display: "none",
};

/**
 * Aggregate first, decide later. The public page only ever sees the three-vote
 * counts and one of three display states; browser/network hashes stay server-side.
 */
export function summarizeFeedback(rows: FeedbackAggregateRow[]): FeedbackSummary {
  const summary: FeedbackSummary = { ...EMPTY_FEEDBACK };
  for (const row of rows) {
    const total = Number(row.total) || 0;
    if (!total) continue;
    if (row.vote === "works") {
      summary.works += total;
      summary.worksBrowsers += Number(row.browsers) || 0;
      summary.worksNetworks += Number(row.networks) || 0;
    } else if (row.vote === "expired") {
      summary.expired += total;
      summary.expiredNetworks += Number(row.networks) || 0;
    } else if (row.vote === "unknown") {
      summary.unknown += total;
    }
    if (row.last_at && (!summary.lastAt || row.last_at > summary.lastAt)) summary.lastAt = row.last_at;
  }
  summary.total = summary.works + summary.expired + summary.unknown;
  summary.display = summary.expiredNetworks >= PUBLIC_EXPIRED_CONFLICT_NETWORKS
    ? "conflict"
    : summary.worksBrowsers >= PUBLIC_WORKS_MIN_BROWSERS && summary.worksNetworks >= PUBLIC_WORKS_MIN_NETWORKS
      ? "positive"
      : "none";
  return summary;
}

export type PublicFeedbackSummary = Pick<FeedbackSummary, "works" | "expired" | "unknown" | "total" | "lastAt" | "display">;

/** Public JSON/HTML never receives the anti-abuse browser/network counts. */
export function publicFeedbackSummary(summary: FeedbackSummary): PublicFeedbackSummary {
  const { works, expired, unknown, total, lastAt, display } = summary;
  return { works, expired, unknown, total, lastAt, display };
}
