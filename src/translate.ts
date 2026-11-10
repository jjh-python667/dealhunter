import type { QueryDb } from "./db";

/**
 * Zero-cost translation of English titles/summaries into Chinese.
 *
 * Engine: Workers AI `@cf/meta/m2m100-1.2b` through the `AI` binding.
 * Cost guard: every row is counted in D1, and the worker refuses to call the
 * model once today's (UTC) count reaches `dailyMaxRows`. The default caps keep
 * usage far below the 10,000 free Neurons/day that Workers AI gives every
 * account, so the account stays inside the free allocation on either plan.
 * If the binding is missing, nothing is called and the page shows originals.
 */

export const MODEL = "@cf/meta/m2m100-1.2b";
export const ENGINE = "workers-ai:m2m100-1.2b";
/** Second cron trigger, 30 minutes after each collection run, translation only. */
export const TRANSLATE_CRON = "30 */2 * * *";

export const DEFAULTS = {
  batchRows: 6,
  dailyMaxRows: 80,
  maxChars: 480,
  maxAttempts: 3,
};

export interface TranslatorBinding {
  run(model: string, input: { text: string; source_lang: string; target_lang: string }): Promise<unknown>;
}

export type TranslateLimits = typeof DEFAULTS;

export type TranslateReport = {
  enabled: boolean;
  reason: string;
  candidates: number;
  translated: number;
  skipped: number;
  failed: number;
  usedToday: number;
  dailyMaxRows: number;
  calls: number;
  inputChars: number;
};

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/g;
const LATIN = /[A-Za-z]/g;

/** True when the text is already mostly Chinese or has no Latin letters to translate. */
export function needsTranslation(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  const cjk = (value.match(CJK) ?? []).length;
  const latin = (value.match(LATIN) ?? []).length;
  if (latin < 3) return false;
  return cjk * 2 < latin;
}

/** Trim to a bounded size at a word boundary so each call has a predictable cost. */
export function clip(text: string, maxChars: number): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= maxChars) return value;
  const cut = value.slice(0, maxChars);
  const space = cut.lastIndexOf(" ");
  return `${(space > maxChars * 0.6 ? cut.slice(0, space) : cut).trim()}…`;
}

export function readTranslation(output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const value = (output as { translated_text?: unknown }).translated_text;
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Reject obviously broken model output (empty, unchanged, or no Chinese at all). */
export function acceptable(source: string, output: string): boolean {
  if (!output) return false;
  if (output === source) return false;
  return (output.match(CJK) ?? []).length >= 2;
}

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function positiveInt(value: unknown, fallback: number, max: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Read optional env overrides; hard ceilings stop a typo from raising cost. */
export function limitsFromEnv(env: Record<string, unknown>): TranslateLimits {
  return {
    batchRows: positiveInt(env.TRANSLATE_BATCH, DEFAULTS.batchRows, 12),
    dailyMaxRows: positiveInt(env.TRANSLATE_DAILY_MAX, DEFAULTS.dailyMaxRows, 150),
    maxChars: positiveInt(env.TRANSLATE_MAX_CHARS, DEFAULTS.maxChars, 600),
    maxAttempts: DEFAULTS.maxAttempts,
  };
}

type Candidate = { id: string; title: string; summary: string; zh_attempts: number };

export async function runTranslation(
  db: QueryDb,
  ai: TranslatorBinding | undefined,
  input: { now?: Date; limits?: TranslateLimits; enabled?: boolean },
): Promise<TranslateReport> {
  const now = input.now ?? new Date();
  const limits = input.limits ?? DEFAULTS;
  const day = utcDay(now);
  const report: TranslateReport = {
    enabled: false,
    reason: "",
    candidates: 0,
    translated: 0,
    skipped: 0,
    failed: 0,
    usedToday: 0,
    dailyMaxRows: limits.dailyMaxRows,
    calls: 0,
    inputChars: 0,
  };
  if (input.enabled === false) {
    report.reason = "disabled";
    return report;
  }
  if (!ai) {
    report.reason = "no_ai_binding";
    return report;
  }

  const used = await db
    .prepare(`SELECT COUNT(*) AS n FROM deals WHERE zh_engine = ? AND substr(zh_at, 1, 10) = ?`)
    .bind(ENGINE, day)
    .first<{ n: number }>();
  report.usedToday = Number(used?.n ?? 0);
  const room = Math.max(0, Math.min(limits.batchRows, limits.dailyMaxRows - report.usedToday));
  if (room === 0) {
    report.reason = "daily_cap_reached";
    return report;
  }
  report.enabled = true;

  const rows = await db
    .prepare(
      `SELECT id, title, summary, zh_attempts FROM deals
       WHERE status = 'active' AND (zh_status IS NULL OR (zh_status = 'error' AND zh_attempts < ?))
       ORDER BY first_seen_at DESC
       LIMIT ?`,
    )
    .bind(limits.maxAttempts, room * 3)
    .all<Candidate>();
  const candidates = rows.results ?? [];
  report.candidates = candidates.length;

  let budget = room;
  for (const row of candidates) {
    const at = now.toISOString();
    const wantTitle = needsTranslation(row.title);
    const wantSummary = needsTranslation(row.summary);
    if (!wantTitle && !wantSummary) {
      await db
        .prepare(`UPDATE deals SET zh_status = 'skip', zh_engine = NULL, zh_at = ?, zh_title = NULL, zh_summary = NULL WHERE id = ?`)
        .bind(at, row.id)
        .run();
      report.skipped += 1;
      continue;
    }
    if (budget <= 0) continue; // keep marking Chinese rows as skip; no more model calls
    budget -= 1;

    try {
      let zhTitle = "";
      let zhSummary = "";
      if (wantTitle) {
        const source = clip(row.title, 200);
        report.calls += 1;
        report.inputChars += source.length;
        const out = readTranslation(await ai.run(MODEL, { text: source, source_lang: "english", target_lang: "chinese" }));
        if (acceptable(source, out)) zhTitle = out;
      }
      if (wantSummary) {
        const source = clip(row.summary, limits.maxChars);
        report.calls += 1;
        report.inputChars += source.length;
        const out = readTranslation(await ai.run(MODEL, { text: source, source_lang: "english", target_lang: "chinese" }));
        if (acceptable(source, out)) zhSummary = out;
      }
      const ok = Boolean(zhTitle || zhSummary);
      await db
        .prepare(
          `UPDATE deals SET zh_title = ?, zh_summary = ?, zh_status = ?, zh_engine = ?, zh_at = ?, zh_attempts = zh_attempts + 1
           WHERE id = ?`,
        )
        .bind(zhTitle || null, zhSummary || null, ok ? "done" : "error", ENGINE, at, row.id)
        .run();
      if (ok) report.translated += 1;
      else report.failed += 1;
    } catch (error) {
      // A model error (for example the free daily allocation being used up) stops
      // this batch. Count the attempt so the row is not retried forever.
      await db
        .prepare(`UPDATE deals SET zh_status = 'error', zh_engine = ?, zh_at = ?, zh_attempts = zh_attempts + 1 WHERE id = ?`)
        .bind(ENGINE, at, row.id)
        .run();
      report.failed += 1;
      report.reason = `model_error: ${error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160)}`;
      break;
    }
  }
  if (!report.reason) report.reason = "ok";
  return report;
}
