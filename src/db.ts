import { isCategory, isDealType } from "./labels";
import type { ValueTier } from "./labels";
import type { DealRecord, RunRecord, SourceCheck } from "./types";

export interface QueryStatement {
  bind(...values: Array<string | number | null>): QueryStatement;
  first<T extends Record<string, unknown>>(): Promise<T | null>;
  all<T extends Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface QueryDb {
  prepare(sql: string): QueryStatement;
}

type DealRow = {
  id: string;
  title: string;
  category: string;
  summary: string;
  value_text: string;
  value_amount: number | null;
  value_currency: string | null;
  value_tier: string;
  conditions: string;
  regions: string;
  starts_at: string | null;
  ends_at: string | null;
  time_text: string;
  steps: string;
  official_url: string;
  source_name: string;
  source_url: string;
  source_id: string;
  last_verified_at: string;
  risk_note: string;
  deal_type: string;
  status: string;
  published_at: string | null;
  rank_score: number;
  first_seen_at: string;
  updated_at: string;
  archive_reason: string;
  zh_title?: string | null;
  zh_summary?: string | null;
};

function asTier(value: string): ValueTier {
  if (value === "money" || value === "money_other" || value === "percent" || value === "quota" || value === "qualitative") {
    return value;
  }
  return "unverified";
}

export function mapDeal(row: DealRow): DealRecord | null {
  if (!isCategory(row.category) || !isDealType(row.deal_type)) return null;
  if (row.status !== "active" && row.status !== "archived") return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    valueText: row.value_text,
    valueAmount: row.value_amount,
    valueCurrency: row.value_currency,
    valueTier: asTier(row.value_tier),
    conditions: row.conditions,
    regions: row.regions,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeText: row.time_text,
    steps: row.steps,
    officialUrl: row.official_url,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    lastVerifiedAt: row.last_verified_at,
    riskNote: row.risk_note,
    dealType: row.deal_type,
    status: row.status,
    publishedAt: row.published_at,
    rankScore: row.rank_score,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
    archiveReason: row.archive_reason,
    zhTitle: row.zh_title ?? "",
    zhSummary: row.zh_summary ?? "",
  };
}

export async function listDeals(db: QueryDb): Promise<DealRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, title, category, summary, value_text, value_amount, value_currency, value_tier,
              conditions, regions, starts_at, ends_at, time_text, steps, official_url, source_name,
              source_url, source_id, last_verified_at, risk_note, deal_type, status, published_at,
              rank_score, first_seen_at, updated_at, archive_reason, zh_title, zh_summary
       FROM deals
       ORDER BY COALESCE(published_at, first_seen_at) DESC
       LIMIT 400`,
    )
    .all<DealRow>();
  return (result.results ?? []).flatMap((row) => {
    const deal = mapDeal(row);
    return deal ? [deal] : [];
  });
}

export async function activeIdsForSource(db: QueryDb, sourceId: string): Promise<string[]> {
  const result = await db.prepare(`SELECT id FROM deals WHERE source_id = ? AND status = 'active'`).bind(sourceId).all<{ id: string }>();
  return (result.results ?? []).map((row) => row.id);
}

export async function dealExists(db: QueryDb, id: string): Promise<boolean> {
  const row = await db.prepare(`SELECT id FROM deals WHERE id = ?`).bind(id).first<{ id: string }>();
  return Boolean(row);
}

export async function firstSeenAt(db: QueryDb, id: string): Promise<string | null> {
  const row = await db.prepare(`SELECT first_seen_at FROM deals WHERE id = ?`).bind(id).first<{ first_seen_at: string }>();
  return row?.first_seen_at ?? null;
}

export async function insertDeal(db: QueryDb, deal: DealRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO deals (
        id, title, category, summary, value_text, value_amount, value_currency, value_tier,
        conditions, regions, starts_at, ends_at, time_text, steps, official_url, source_name,
        source_url, source_id, last_verified_at, risk_note, deal_type, status, published_at,
        rank_score, first_seen_at, updated_at, archive_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      deal.id,
      deal.title,
      deal.category,
      deal.summary,
      deal.valueText,
      deal.valueAmount,
      deal.valueCurrency,
      deal.valueTier,
      deal.conditions,
      deal.regions,
      deal.startsAt,
      deal.endsAt,
      deal.timeText,
      deal.steps,
      deal.officialUrl,
      deal.sourceName,
      deal.sourceUrl,
      deal.sourceId,
      deal.lastVerifiedAt,
      deal.riskNote,
      deal.dealType,
      deal.status,
      deal.publishedAt,
      deal.rankScore,
      deal.firstSeenAt,
      deal.updatedAt,
      deal.archiveReason,
    )
    .run();
}

export async function updateDeal(db: QueryDb, deal: DealRecord): Promise<void> {
  await db
    .prepare(
      `UPDATE deals SET
        zh_status = CASE WHEN title = ?1 AND summary = ?3 THEN zh_status ELSE NULL END,
        zh_title = CASE WHEN title = ?1 AND summary = ?3 THEN zh_title ELSE NULL END,
        zh_summary = CASE WHEN title = ?1 AND summary = ?3 THEN zh_summary ELSE NULL END,
        zh_attempts = CASE WHEN title = ?1 AND summary = ?3 THEN zh_attempts ELSE 0 END,
        title = ?1,
        category = ?2,
        summary = ?3,
        value_text = ?4,
        value_amount = ?5,
        value_currency = ?6,
        value_tier = ?7,
        conditions = ?8,
        regions = ?9,
        starts_at = ?10,
        ends_at = ?11,
        time_text = ?12,
        steps = ?13,
        official_url = ?14,
        source_name = ?15,
        source_url = ?16,
        source_id = ?17,
        last_verified_at = ?18,
        risk_note = ?19,
        deal_type = ?20,
        status = ?21,
        published_at = ?22,
        rank_score = ?23,
        updated_at = ?24,
        archive_reason = ?25
       WHERE id = ?26`,
    )
    .bind(
      deal.title,
      deal.category,
      deal.summary,
      deal.valueText,
      deal.valueAmount,
      deal.valueCurrency,
      deal.valueTier,
      deal.conditions,
      deal.regions,
      deal.startsAt,
      deal.endsAt,
      deal.timeText,
      deal.steps,
      deal.officialUrl,
      deal.sourceName,
      deal.sourceUrl,
      deal.sourceId,
      deal.lastVerifiedAt,
      deal.riskNote,
      deal.dealType,
      deal.status,
      deal.publishedAt,
      deal.rankScore,
      deal.updatedAt,
      deal.archiveReason,
      deal.id,
    )
    .run();
}

export async function archiveDeal(db: QueryDb, id: string, reason: string, verifiedAt: string): Promise<void> {
  await db
    .prepare(
      `UPDATE deals SET status = 'archived', archive_reason = ?, updated_at = ?, last_verified_at = ?
       WHERE id = ? AND status = 'active'`,
    )
    .bind(reason, verifiedAt, verifiedAt, id)
    .run();
}

export async function insertRun(db: QueryDb, run: { id: string; trigger: string; cron: string | null; startedAt: string }): Promise<void> {
  await db
    .prepare(`INSERT INTO runs (id, trigger, cron, started_at, ok) VALUES (?, ?, ?, ?, 0)`)
    .bind(run.id, run.trigger, run.cron, run.startedAt)
    .run();
}

export async function finishRun(
  db: QueryDb,
  run: {
    id: string;
    finishedAt: string;
    ok: boolean;
    inserted: number;
    updated: number;
    archived: number;
    skipped: number;
    error: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE runs SET finished_at = ?, ok = ?, inserted_count = ?, updated_count = ?, archived_count = ?,
        skipped_count = ?, error = ? WHERE id = ?`,
    )
    .bind(run.finishedAt, run.ok ? 1 : 0, run.inserted, run.updated, run.archived, run.skipped, run.error, run.id)
    .run();
}

export async function insertSourceCheck(db: QueryDb, runId: string, check: SourceCheck): Promise<void> {
  await db
    .prepare(
      `INSERT INTO source_checks (run_id, source_id, source_url, http_status, ok, error, items_seen, items_kept, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      check.sourceId,
      check.sourceUrl,
      check.httpStatus,
      check.ok ? 1 : 0,
      check.error || null,
      check.itemsSeen,
      check.itemsKept,
      check.checkedAt,
    )
    .run();
}

export async function latestRun(db: QueryDb): Promise<RunRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, trigger, cron, started_at, finished_at, ok, inserted_count, updated_count, archived_count, skipped_count, error
       FROM runs ORDER BY started_at DESC LIMIT 1`,
    )
    .first<{
      id: string;
      trigger: string;
      cron: string | null;
      started_at: string;
      finished_at: string | null;
      ok: number;
      inserted_count: number;
      updated_count: number;
      archived_count: number;
      skipped_count: number;
      error: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    trigger: row.trigger,
    cron: row.cron,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    ok: row.ok === 1,
    inserted: row.inserted_count,
    updated: row.updated_count,
    archived: row.archived_count,
    skipped: row.skipped_count,
    error: row.error ?? "",
  };
}

export async function checksForRun(db: QueryDb, runId: string): Promise<SourceCheck[]> {
  const result = await db
    .prepare(
      `SELECT source_id, source_url, http_status, ok, error, items_seen, items_kept, checked_at
       FROM source_checks WHERE run_id = ? ORDER BY id ASC`,
    )
    .bind(runId)
    .all<{
      source_id: string;
      source_url: string;
      http_status: number | null;
      ok: number;
      error: string | null;
      items_seen: number;
      items_kept: number;
      checked_at: string;
    }>();
  return (result.results ?? []).map((row) => ({
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    httpStatus: row.http_status,
    ok: row.ok === 1,
    error: row.error ?? "",
    itemsSeen: row.items_seen,
    itemsKept: row.items_kept,
    checkedAt: row.checked_at,
  }));
}

export async function lastSuccessfulSourceChecks(
  db: QueryDb,
  checks: SourceCheck[],
): Promise<Map<string, string>> {
  const failedIds = [...new Set(checks.filter(check => !check.ok).map(check => check.sourceId))];
  if (!failedIds.length) return new Map();
  const placeholders = failedIds.map(() => "?").join(", ");
  const result = await db.prepare(
    `SELECT source_id, MAX(checked_at) AS last_success_at
     FROM source_checks WHERE ok = 1 AND source_id IN (${placeholders}) GROUP BY source_id`,
  ).bind(...failedIds).all<{ source_id: string; last_success_at: string }>();
  return new Map((result.results ?? []).map(row => [row.source_id, row.last_success_at]));
}
