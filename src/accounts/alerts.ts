import { offerEvidence, offerRevision } from "../content/evidence";
import { mapDeal } from "../db";
import { isEndingSoon, isExpired, shanghaiDay } from "../extract";
import type { DealRecord } from "../types";
import { DEFAULT_PREFS, parsePrefs } from "./data";

const DAY = 86_400_000;
const HOUR = DAY / 24;
export const ALERT_USER_BATCH = 8;
const CLEANUP_BATCH = 250;
export type AlertKind = "newOffer" | "changed" | "ending";
type AlertEvent = {deal_id: string; kind: AlertKind; dedupe_key: string};

/** Future channels can consume committed inbox items. No external sender is wired. */
export interface Notifier {
  notify(userId: string, events: readonly AlertEvent[]): Promise<void>;
}

export function alertsEnabled(env: Env): boolean {
  const flags = env as Env & {ACCOUNTS_ENABLED?: string; ALERTS_SERVER_ENABLED?: string};
  return flags.ACCOUNTS_ENABLED === "1" && flags.ALERTS_SERVER_ENABLED === "1";
}

export async function runAccountAlerts(env: Env, scheduledTime: number): Promise<void> {
  if (!alertsEnabled(env)) return;
  const now = new Date(scheduledTime);
  for (const [name, task] of Object.entries({generate:generateAccountAlerts, cleanup:cleanupAccountAlerts})) {
    try {
      await task(env.DB, now);
    } catch {
      console.error("Deal Hunter account alert task failed", name);
    }
  }
}

type Watch = Parameters<typeof mapDeal>[0] & {user_id: string; last_revision: string | null};
type ScanUser = {id: string; since: string; prefs_json: string | null};

function prefsFor(value: string | null) {
  try { return value ? parsePrefs(JSON.parse(value)) ?? DEFAULT_PREFS : DEFAULT_PREFS; }
  catch { return DEFAULT_PREFS; }
}

function matches(deal: DealRecord, evidence: ReturnType<typeof offerEvidence>, prefs: typeof DEFAULT_PREFS, now: Date) {
  if (deal.status === "archived" || isExpired(deal.endsAt, now) || (deal.startsAt && Date.parse(deal.startsAt) > now.getTime())) return false;
  if (!prefs.region && !prefs.category && !prefs.noCard && !prefs.noRenewal) return false;
  return (!prefs.region || evidence.regions.includes("global") || evidence.regions.includes(prefs.region))
    && (!prefs.category || prefs.category === deal.category)
    && (!prefs.noCard || evidence.card === "no")
    && (!prefs.noRenewal || evidence.renewal === "no");
}

export async function generateAccountAlerts(db: D1Database, now: Date, limit = ALERT_USER_BATCH): Promise<number> {
  const at = now.toISOString();
  // Least-recently-checked users form a persistent rotating cursor. A user's
  // own discovery watermark survives partial passes and delayed cron runs.
  const users = (await db.prepare(`SELECT u.id, COALESCE(scan.checked_at, u.created_at) AS since, p.prefs_json
    FROM users AS u LEFT JOIN alert_scan_progress AS scan ON scan.user_id=u.id
    LEFT JOIN alert_prefs AS p ON p.user_id=u.id
    WHERE COALESCE(scan.checked_at, u.created_at) < ?
    ORDER BY since, u.id LIMIT ?`).bind(at, Math.max(0, Math.min(ALERT_USER_BATCH, Math.trunc(limit)))).all<ScanUser>()).results;
  if (!users.length) return 0;
  const oldest = users.reduce((value, user) => user.since < value ? user.since : value, at);
  const lower = new Date(now.getTime() - 90 * DAY).toISOString();
  const [discovered, watched] = await Promise.all([
    db.prepare("SELECT * FROM deals WHERE status='active' AND first_seen_at>? AND first_seen_at<=?")
      .bind(oldest > lower ? oldest : lower, at).all<Parameters<typeof mapDeal>[0]>(),
    db.prepare(`SELECT d.*, s.user_id, a.last_revision FROM user_saved AS s
      JOIN deals AS d ON d.id=s.deal_id
      LEFT JOIN alert_state AS a ON a.user_id=s.user_id AND a.deal_id=s.deal_id
      WHERE s.user_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(users.map(user => user.id))).all<Watch>(),
  ]);
  const available = discovered.results.map(mapDeal).filter(deal => deal !== null);
  const byUser = new Map<string, Watch[]>();
  for (const row of watched.results) {
    const rows = byUser.get(row.user_id) ?? [];
    rows.push(row);
    byUser.set(row.user_id, rows);
  }
  const facts = new Map<string, {evidence: ReturnType<typeof offerEvidence>; revision: string}>();
  function evidenceFor(deal: DealRecord) {
    const previous = facts.get(deal.id);
    if (previous) return previous;
    const evidence = offerEvidence(deal);
    const entry = {evidence, revision: offerRevision(deal, evidence)};
    facts.set(deal.id, entry);
    return entry;
  }
  const day = shanghaiDay(now);
  for (const user of users) {
    const prefs = prefsFor(user.prefs_json);
    const events: AlertEvent[] = [];
    const revisions: Array<{id: string; revision: string}> = [];
    const add = (deal: DealRecord, kind: AlertKind, key: string) => {
      if (prefs.channels.site && prefs[kind]) events.push({deal_id:deal.id, kind, dedupe_key:key});
    };
    if (prefs.channels.site && prefs.newOffer) {
      for (const deal of available) {
        if (deal.firstSeenAt > user.since && deal.firstSeenAt <= at && matches(deal, evidenceFor(deal).evidence, prefs, now)) {
          add(deal, "newOffer", "new:" + deal.id);
        }
      }
    }
    for (const row of byUser.get(user.id) ?? []) {
      const deal = mapDeal(row);
      if (!deal) continue;
      const {evidence, revision} = evidenceFor(deal);
      if (row.last_revision !== revision) revisions.push({id:deal.id, revision});
      if (row.last_revision && row.last_revision !== revision) add(deal, "changed", `changed:${deal.id}:${revision}`);
      if (deal.status !== "archived" && (!deal.startsAt || Date.parse(deal.startsAt) <= now.getTime()) && isEndingSoon(deal.endsAt, now)) {
        add(deal, "ending", `ending:${deal.id}:${evidence.deadline}`);
      }
    }
    // Do not let a delayed invocation overwrite state written by a newer scan.
    const current = "(SELECT 1 FROM users WHERE id=?2 AND NOT EXISTS (SELECT 1 FROM alert_scan_progress WHERE user_id=?2 AND checked_at>=?3))";
    await db.batch([
      ...(events.length ? [db.prepare(`INSERT INTO alert_inbox(user_id, dedupe_key, kind, deal_id, created_at, day)
        SELECT ?2,json_extract(value,'$.dedupe_key'),json_extract(value,'$.kind'),json_extract(value,'$.deal_id'),?3,?4
        FROM json_each(?1) WHERE EXISTS ${current}
        AND (json_extract(value,'$.kind')='newOffer' OR EXISTS
          (SELECT 1 FROM user_saved WHERE user_id=?2 AND deal_id=json_extract(value,'$.deal_id')))
        ON CONFLICT(user_id,dedupe_key) DO NOTHING`).bind(JSON.stringify(events), user.id, at, day)] : []),
      ...(revisions.length ? [db.prepare(`INSERT INTO alert_state(user_id, deal_id, last_revision)
        SELECT ?2,json_extract(value,'$.id'),json_extract(value,'$.revision') FROM json_each(?1)
        WHERE EXISTS ${current} AND EXISTS (SELECT 1 FROM user_saved WHERE user_id=?2 AND deal_id=json_extract(value,'$.id'))
        ON CONFLICT(user_id,deal_id) DO UPDATE SET last_revision=excluded.last_revision`).bind(JSON.stringify(revisions), user.id, at)] : []),
      db.prepare(`INSERT INTO alert_scan_progress(user_id, checked_at) SELECT id, ? FROM users WHERE id=?
        ON CONFLICT(user_id) DO UPDATE SET checked_at=excluded.checked_at WHERE checked_at < excluded.checked_at`).bind(at, user.id),
    ]);
  }
  return users.length;
}

export async function cleanupAccountAlerts(db: D1Database, now: Date): Promise<void> {
  const iso = (age: number) => new Date(now.getTime() - age).toISOString();
  const targets = [
    ["sessions", "expires_at <= ? OR created_at <= ?", [iso(0), iso(180 * DAY)]],
    ["oauth_states", "expires_at <= ?", [iso(0)]],
    ["saved_tombstones", "removed_at < ?", [iso(30 * DAY)]],
    ["alert_inbox", "created_at < ?", [iso(90 * DAY)]],
    ["auth_rate", "window_start < ?", [iso(DAY)]],
  ] as const;
  await db.batch(targets.map(([table, where, params]) => db.prepare(
    `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${CLEANUP_BATCH})`,
  ).bind(...params)));
}

export function visibleAlertDay(now: number): string {
  // The previous Shanghai day becomes eligible at 09:00 local time.
  return new Date(now - HOUR).toISOString().slice(0, 10);
}
