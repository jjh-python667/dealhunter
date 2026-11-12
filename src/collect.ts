import {
  activeIdsForSource,
  archiveDeal,
  finishRun,
  insertRun,
  insertSourceCheck,
  listDeals,
  saveCollectedDeal,
  type QueryDb,
} from "./db";
import {
  assessValue,
  classifyDealType,
  extractConditions,
  extractRegions,
  extractSteps,
  extractTime,
  isExpired,
  rankScore,
  reconcilePlan,
  refineCategory,
} from "./extract";
import { riskNote, type Category } from "./labels";
import { dealExcerptFromItem, parseFeed } from "./parse";
import { matchPage, SOURCES, USER_AGENT, type SourceDef } from "./sources";
import { looksLikeChallenge, pageText } from "./text";
import type { DealRecord, SourceCheck } from "./types";
import { fingerprint, normalizeTitle, sanitizeUrl } from "./url";

const MAX_BYTES = 160_000;

export type CollectionReport = {
  runId: string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  inserted: number;
  updated: number;
  archived: number;
  skipped: number;
  checks: SourceCheck[];
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  error: string;
};

async function readLimited(response: Response, maxBytes: number): Promise<{text: string; truncated: boolean}> {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", truncated: false };
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = maxBytes - received;
      const slice = value.byteLength > room ? value.subarray(0, room) : value;
      chunks.push(slice);
      received += slice.byteLength;
      if (value.byteLength > room) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), truncated: received >= maxBytes };
}

async function buildStoredDeal(input: {
  source: SourceDef;
  title: string;
  excerpt: string;
  link: string;
  publishedAt: string | null;
  raw: string;
  now: Date;
  idParts: string[];
}): Promise<DealRecord> {
  const nowIso = input.now.toISOString();
  const category: Category = refineCategory(input.source.category, `${input.title}\n${input.excerpt}`);
  const value = assessValue(input.excerpt);
  const time = extractTime(`${input.title}\n${input.excerpt}`);
  const expired = time.endsAt ? isExpired(time.endsAt, input.now) : false;
  const typed = classifyDealType(`${input.title}\n${input.excerpt}`);
  const dealType = typed === "free" && time.endsAt ? "trial" : typed;
  return {
    id: await fingerprint(input.idParts),
    title: input.title.slice(0, 240),
    category,
    summary: input.excerpt.slice(0, 700),
    valueText: value.valueText,
    valueAmount: value.amount,
    valueCurrency: value.currency,
    valueTier: value.tier,
    conditions: extractConditions(input.excerpt),
    regions: extractRegions(input.excerpt),
    startsAt: time.startsAt,
    endsAt: time.endsAt,
    timeText: time.timeText,
    steps: extractSteps(input.raw),
    officialUrl: sanitizeUrl(input.link),
    sourceName: input.source.name,
    sourceUrl: input.source.url,
    sourceId: input.source.id,
    lastVerifiedAt: nowIso,
    riskNote: riskNote(category, input.excerpt),
    dealType,
    status: expired ? "archived" : "active",
    publishedAt: input.publishedAt,
    rankScore: rankScore(value),
    firstSeenAt: nowIso,
    updatedAt: nowIso,
    archiveReason: expired ? "截止时间已过" : "",
  };
}

export async function runCollection(
  db: QueryDb,
  input: { trigger: string; cron?: string | null; now?: Date; fetchImpl?: typeof fetch; sources?: SourceDef[] },
): Promise<CollectionReport> {
  const now = input.now ?? new Date();
  const startedAt = now.toISOString();
  const runId = crypto.randomUUID();
  const fetchImpl = input.fetchImpl ?? fetch;
  const checks: SourceCheck[] = [];
  let inserted = 0;
  let updated = 0;
  let archived = 0;
  let skipped = 0;
  let fatal = "";

  await insertRun(db, { id: runId, trigger: input.trigger, cron: input.cron ?? null, startedAt });

  try {
    const dated = await db
      .prepare(`SELECT id, ends_at FROM deals WHERE status = 'active' AND ends_at IS NOT NULL`)
      .all<{ id: string; ends_at: string }>();
    for (const row of dated.results ?? []) {
      if (!isExpired(row.ends_at, now)) continue;
      await archiveDeal(db, row.id, "截止时间已过", startedAt);
      archived += 1;
    }

    for (const source of input.sources ?? SOURCES) {
      const checkedAt = new Date().toISOString();
      let status: number | null = null;
      let body = "";
      let truncated = false;
      let fetchOk = false;
      let error = "";
      try {
        const response = await fetchImpl(source.url, {
          redirect: "follow",
          headers: {
            "user-agent": USER_AGENT,
            accept:
              source.kind === "feed"
                ? "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
                : "text/html,application/xhtml+xml,*/*",
          },
          signal: AbortSignal.timeout(15_000),
        });
        status = response.status;
        ({ text: body, truncated } = await readLimited(response, MAX_BYTES));
        fetchOk = response.ok && !looksLikeChallenge(response.status, body);
        if (!response.ok) error = `HTTP ${response.status}`;
        else if (!fetchOk) error = "疑似拦截页，未把空结果当成优惠下线";
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }

      const seenIds: string[] = [];
      let itemsSeen = 0;
      let itemsKept = 0;
      if (fetchOk && source.kind === "feed") {
        const items = parseFeed(body);
        itemsSeen = items.length;
        if (!items.length && (!/<(?:rss|feed|rdf:RDF)\b/i.test(body) || /<(?:item|entry)\b/i.test(body))) {
          error = "响应里没有可解析的 RSS/Atom 条目";
          fetchOk = false;
        }
        for (const item of items) {
          const excerpt = dealExcerptFromItem(item);
          if (!excerpt) {
            skipped += 1;
            continue;
          }
          const link = sanitizeUrl(item.link);
          const deal = await buildStoredDeal({
            source,
            title: item.title,
            excerpt,
            link: item.link,
            publishedAt: item.publishedAt,
            raw: item.raw,
            now,
            idParts: link ? [`url:${link}`] : [`feed:${source.id}:${normalizeTitle(item.title)}`],
          });
          const outcome = await saveCollectedDeal(db, deal);
          if (outcome === "inserted") inserted += 1;
          else updated += 1;
          itemsKept += 1;
          seenIds.push(deal.id);
        }
      } else if (fetchOk && source.kind === "page") {
        const page = pageText(body);
        const excerpts = matchPage(page.text, source);
        itemsSeen = 1;
        if (!excerpts.length && truncated) {
          error = "来源内容超过读取上限，未确认优惠下线";
          fetchOk = false;
        }
        for (const excerpt of excerpts) {
          const title = source.repeatPattern ? excerpt.slice(0, 180) : page.title || excerpt.slice(0, 180);
          const deal = await buildStoredDeal({
            source,
            title,
            excerpt,
            link: source.url,
            publishedAt: null,
            raw: "",
            now,
            idParts: source.repeatPattern
              ? [`page:${source.id}:${normalizeTitle(excerpt).slice(0, 180)}`]
              : [`page:${source.id}`],
          });
          const outcome = await saveCollectedDeal(db, deal);
          if (outcome === "inserted") inserted += 1;
          else updated += 1;
          itemsKept += 1;
          seenIds.push(deal.id);
        }
      }

      if (fetchOk && source.kind === "page") {
        const existingIds = await activeIdsForSource(db, source.id);
        for (const id of reconcilePlan({ kind: source.kind, fetchOk, existingIds, seenIds })) {
          await archiveDeal(db, id, "来源页面这次已匹配不到原先的表述", checkedAt);
          archived += 1;
        }
      }

      const check: SourceCheck = {
        sourceId: source.id,
        sourceUrl: source.url,
        httpStatus: status,
        ok: fetchOk,
        error,
        itemsSeen,
        itemsKept,
        checkedAt,
      };
      checks.push(check);
      await insertSourceCheck(db, runId, check);
    }
  } catch (cause) {
    fatal = cause instanceof Error ? cause.message : String(cause);
  }

  const finishedAt = new Date().toISOString();
  await finishRun(db, {
    id: runId,
    finishedAt,
    ok: !fatal,
    inserted,
    updated,
    archived,
    skipped,
    error: fatal || null,
  });
  if (fatal) throw new Error(fatal);

  const deals = input.sources ? [] : await listDeals(db);
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const deal of deals) {
    if (deal.status !== "active") continue;
    byCategory[deal.category] = (byCategory[deal.category] ?? 0) + 1;
    bySource[deal.sourceId] = (bySource[deal.sourceId] ?? 0) + 1;
  }
  console.log(
    JSON.stringify({
      message: "collection finished",
      runId,
      trigger: input.trigger,
      inserted,
      updated,
      archived,
      skipped,
      failedSources: checks.filter((check) => !check.ok).map((check) => check.sourceId),
    }),
  );
  return { runId, trigger: input.trigger, startedAt, finishedAt, inserted, updated, archived, skipped, checks, byCategory, bySource, error: "" };
}
