import { adminDecision } from "./auth";
import { buildBoard } from "./board";
import { runCollection } from "./collect";
import {
  checksForRun,
  collectionToken,
  feedbackCountForBrowser,
  feedbackCountForNetwork,
  feedbackSummaryForDeal,
  getDeal,
  lastSuccessfulSourceChecks,
  latestRun,
  listDeals,
  recordFeedback,
  recentSourceChecks,
  reviewFeedback,
  sourcePerformance,
  type QueryDb,
} from "./db";
import {
  EMPTY_FEEDBACK,
  FEEDBACK_DAILY_MAX,
  FEEDBACK_DAILY_MS,
  FEEDBACK_NETWORK_DAILY_MAX,
  FEEDBACK_NETWORK_DAILY_MS,
  FEEDBACK_NETWORK_WINDOW_MAX,
  FEEDBACK_NETWORK_WINDOW_MS,
  FEEDBACK_RATE_WINDOW_MAX,
  FEEDBACK_RATE_WINDOW_MS,
  dealTermsVersion,
  feedbackHashes,
  feedbackWindowStart,
  isFeedbackBrowserId,
  isFeedbackReviewStatus,
  isFeedbackTermsVersion,
  isFeedbackVote,
  publicFeedbackSummary,
} from "./feedback";
import { renderPage } from "./page";
import { langFromUrl, resolveRoute } from "./routes";
import { RADAR_CRON, scheduledSources } from "./sources";
import { saveSnapshots, serveSnapshot, snapshotBoundary, type SnapshotLang, type SnapshotPage } from "./snapshots";
import { TRANSLATE_CRON, limitsFromEnv, runTranslation, type TranslatorBinding } from "./translate";
import { renderDealDetail } from "./ui/detail";
import { renderHome } from "./ui/home";
import { renderNotFound, renderServiceUnavailable } from "./ui/notfound";

function translator(env: Env): TranslatorBinding | undefined {
  const ai = (env as unknown as { AI?: TranslatorBinding }).AI;
  return ai && typeof ai.run === "function" ? ai : undefined;
}

function translateOn(env: Env): boolean {
  return String((env as unknown as Record<string, unknown>).TRANSLATE_ENABLED ?? "1") !== "0";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'self'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Never store the raw address; the caller hashes it and the digest rotates daily. */
function clientNetworkKey(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  return ip.slice(0, 80);
}

/** Production secret; the fallback only exists so local dev/tests keep working. */
function feedbackPepper(env: Env): string | undefined {
  const value = (env as unknown as Record<string, unknown>).FEEDBACK_PEPPER;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Public, anonymous, idempotent vote: "still works / expired / not sure".
 * The page always tells the visitor which version they are voting on, and the
 * server recomputes that version before accepting the vote, so a stale tab can
 * never mix feedback across changed terms.
 */
async function submitFeedback(request: Request, db: QueryDb, pepper: string | undefined): Promise<Response> {
  // No public fallback: without the server-side secret, refuse rather than hash
  // predictable identifiers. The detail page itself stays readable; only the
  // write path is disabled.
  if (!pepper) {
    console.error(JSON.stringify({ message: "feedback unavailable: FEEDBACK_PEPPER is not configured" }));
    return json({ error: "feedback_unavailable" }, 503);
  }
  const payload = await readJsonObject(request);
  if (!payload) return json({ error: "invalid_payload" }, 400);
  const dealId = typeof payload.dealId === "string" ? payload.dealId.trim() : "";
  const vote = payload.vote;
  const browserId = payload.browserId;
  const termsVersion = payload.termsVersion;
  if (!dealId || dealId.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/.test(dealId)) {
    return json({ error: "invalid_deal" }, 400);
  }
  if (!isFeedbackVote(vote)) return json({ error: "invalid_vote" }, 400);
  if (!isFeedbackBrowserId(browserId)) return json({ error: "invalid_browser" }, 400);
  if (!isFeedbackTermsVersion(termsVersion)) return json({ error: "invalid_version" }, 400);
  try {
    const deal = await getDeal(db, dealId);
    if (!deal) return json({ error: "deal_not_found" }, 404);
    const currentVersion = dealTermsVersion(deal);
    const now = new Date();
    if (currentVersion !== termsVersion) {
      const summary = await feedbackSummaryForDeal(db, deal.id, currentVersion, feedbackWindowStart(now))
        .then((result) => result.summary)
        .catch(() => EMPTY_FEEDBACK);
      return json({ error: "stale_version", summary: publicFeedbackSummary(summary) }, 409);
    }
    const { browserHash, networkHash } = await feedbackHashes({
      browserId,
      networkKey: clientNetworkKey(request),
      now,
      pepper,
    });
    const windowStart = new Date(now.getTime() - FEEDBACK_RATE_WINDOW_MS).toISOString();
    if (await feedbackCountForBrowser(db, browserHash, windowStart) >= FEEDBACK_RATE_WINDOW_MAX) {
      return json({ error: "rate_limited", scope: "browser", retryAfterMs: FEEDBACK_RATE_WINDOW_MS }, 429);
    }
    const dayStart = new Date(now.getTime() - FEEDBACK_DAILY_MS).toISOString();
    if (await feedbackCountForBrowser(db, browserHash, dayStart) >= FEEDBACK_DAILY_MAX) {
      return json({ error: "rate_limited", scope: "browser", retryAfterMs: FEEDBACK_DAILY_MS }, 429);
    }
    const networkWindowStart = new Date(now.getTime() - FEEDBACK_NETWORK_WINDOW_MS).toISOString();
    if (await feedbackCountForNetwork(db, networkHash, networkWindowStart) >= FEEDBACK_NETWORK_WINDOW_MAX) {
      return json({ error: "rate_limited", scope: "network", retryAfterMs: FEEDBACK_NETWORK_WINDOW_MS }, 429);
    }
    const networkDayStart = new Date(now.getTime() - FEEDBACK_NETWORK_DAILY_MS).toISOString();
    if (await feedbackCountForNetwork(db, networkHash, networkDayStart) >= FEEDBACK_NETWORK_DAILY_MAX) {
      return json({ error: "rate_limited", scope: "network", retryAfterMs: FEEDBACK_NETWORK_DAILY_MS }, 429);
    }
    const inserted = await recordFeedback(db, {
      dealId: deal.id,
      termsVersion: currentVersion,
      vote,
      browserHash,
      networkHash,
      createdAt: now.toISOString(),
    });
    const summary = await feedbackSummaryForDeal(db, deal.id, currentVersion, feedbackWindowStart(now));
    return json({ ok: true, created: inserted === "inserted", vote, summary: publicFeedbackSummary(summary.summary) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "feedback submit failed", error: message }));
    return json({ error: "feedback_unavailable" }, 503);
  }
}

/** Small operator endpoint until the admin UI lands; same ADMIN_TOKEN gate as collection. */
async function reviewFeedbackRequest(request: Request, db: QueryDb, adminToken: string | undefined): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const decision = await adminDecision(request, adminToken);
  if (decision === "unconfigured") return json({ error: "admin_not_configured" }, 503);
  if (decision === "unauthorized") return json({ error: "unauthorized" }, 401);
  const payload = await readJsonObject(request);
  if (!payload) return json({ error: "invalid_payload" }, 400);
  const id = typeof payload.id === "number" && Number.isInteger(payload.id) && payload.id > 0 ? payload.id : 0;
  const status = payload.status;
  const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 200) : "";
  if (!id || !isFeedbackReviewStatus(status) || (status !== "kept" && status !== "held")) {
    return json({ error: "invalid_review" }, 400);
  }
  try {
    const updated = await reviewFeedback(db, { id, status, note, reviewedAt: new Date().toISOString() });
    return updated ? json({ ok: true }) : json({ error: "not_found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "feedback review failed", error: message }));
    return json({ error: "review_failed" }, 500);
  }
}

async function dashboard(db: QueryDb, expand: boolean, lang: "zh" | "en", channel?: "ai" | "cloud"): Promise<Response> {
  try {
    const now = new Date();
    return html(renderPage({ ...await dashboardData(db, now), expand, lang, channel }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "dashboard load failed", error: message }));
    return html(
      renderPage({
        board: buildBoard([], new Date()),
        checks: [],
        run: null,
        now: new Date(),
        expand: false,
        dbError: "unavailable",
        channel,
      }),
      500,
    );
  }
}

async function dashboardData(db: QueryDb, now: Date) {
  const [deals, run, checks, updateToken] = await Promise.all([
    listDeals(db), latestRun(db), recentSourceChecks(db), collectionToken(db),
  ]);
  const sourceSuccess = await lastSuccessfulSourceChecks(db, checks).catch(error => {
    console.error("Could not load source success history", error);
    return undefined;
  });
  return { deals, run, checks, updateToken, sourceSuccess, board: buildBoard(deals, now), now };
}

async function refreshSnapshots(env: Env): Promise<void> {
  try {
    const now = new Date();
    const data = await dashboardData(env.DB as unknown as QueryDb, now);
    const pages: Array<{page: SnapshotPage; lang: SnapshotLang; html: string}> = [];
    for (const lang of ["zh", "en"] as const) {
      pages.push({ page: "home", lang, html: renderHome({ ...data, lang }) });
      for (const channel of ["ai", "cloud"] as const) {
        pages.push({ page: channel, lang, html: renderPage({ ...data, expand: false, lang, channel }) });
      }
    }
    await saveSnapshots(env.DB, now.getTime(), snapshotBoundary(data.deals, now.getTime()), pages);
  } catch (error) {
    console.error("Could not refresh portal snapshots", error);
  }
}

async function portalHome(db: QueryDb, lang: "zh" | "en"): Promise<Response> {
  try {
    const now = new Date();
    let dealRows: number | undefined;
    const [deals, run] = await Promise.all([listDeals(db, rows => { dealRows = rows; }), latestRun(db)]);
    const response = html(renderHome({ deals, now, lang, run }));
    if (dealRows !== undefined) response.headers.set("server-timing", `deal_d1_rows;dur=${dealRows}`);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "home load failed", error: message }));
    return html(renderHome({ deals: [], now: new Date(), lang, run: null, error: "unavailable" }), 500);
  }
}

async function dealDetail(db: QueryDb, id: string, lang: "zh" | "en", origin: string): Promise<Response> {
  try {
    const now = new Date();
    const deal = await getDeal(db, id);
    if (!deal) return html(renderNotFound({ lang, path: `/deal/${id}` }), 404);
    const termsVersion = dealTermsVersion(deal);
    const feedback = await feedbackSummaryForDeal(db, deal.id, termsVersion, feedbackWindowStart(now))
      .then((result) => result.summary)
      .catch((error) => {
        // Feedback is advisory; a broken feedback table must never hide the deal.
        console.error(JSON.stringify({ message: "feedback summary failed", error: error instanceof Error ? error.message : String(error) }));
        return EMPTY_FEEDBACK;
      });
    return html(renderDealDetail({ deal, now, lang, origin, feedback }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: "detail load failed", error: message }));
    return html(renderServiceUnavailable({ lang, path: `/deal/${id}` }), 503);
  }
}

export default {
  async fetch(request, env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const db = env.DB as unknown as QueryDb;
    console.log(JSON.stringify({ message: "request", method: request.method, path: url.pathname }));

    if (url.pathname === "/api/health") {
      return json({ ok: true, worker: "dealhunter" });
    }
    if (url.pathname === "/api/board") {
      const deals = await listDeals(db);
      return json({ generatedAt: new Date().toISOString(), board: buildBoard(deals, new Date()) });
    }
    if (url.pathname === "/api/updates" && request.method === "GET") {
      try {
        return json({ token: await collectionToken(db) });
      } catch {
        return json({ error: "collection_status_unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/source-performance" && request.method === "GET") {
      try {
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const rows = await sourcePerformance(db, since);
        return new Response(JSON.stringify(rows), {
          headers: {"content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=900"},
        });
      } catch {
        return json({ error: "source_performance_unavailable" }, 503);
      }
    }
    if (url.pathname === "/api/runs") {
      const run = await latestRun(db);
      const checks = run ? await checksForRun(db, run.id) : [];
      return json({ run, checks });
    }
    if (url.pathname === "/api/feedback") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return submitFeedback(request, db, feedbackPepper(env));
    }
    if (url.pathname === "/api/admin/feedback/review") {
      return reviewFeedbackRequest(request, db, env.ADMIN_TOKEN);
    }
    if (url.pathname === "/api/admin/collect") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const decision = await adminDecision(request, env.ADMIN_TOKEN);
      if (decision === "unconfigured") return json({ error: "admin_not_configured" }, 503);
      if (decision === "unauthorized") return json({ error: "unauthorized" }, 401);
      try {
        const report = await runCollection(db, { trigger: "admin" });
        if (report.checks.some(check => check.ok)) {
          const refresh = refreshSnapshots(env);
          if (ctx) ctx.waitUntil(refresh);
          else await refresh;
        }
        return json(report);
      } catch (error) {
        console.error(JSON.stringify({ message: "admin collection failed", error: error instanceof Error ? error.message : String(error) }));
        return json({ error: "collection_failed" }, 500);
      }
    }
    if (url.pathname === "/api/admin/translate") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const decision = await adminDecision(request, env.ADMIN_TOKEN);
      if (decision === "unconfigured") return json({ error: "admin_not_configured" }, 503);
      if (decision === "unauthorized") return json({ error: "unauthorized" }, 401);
      try {
        const env2 = env as unknown as Record<string, unknown>;
        return json(await runTranslation(db, translator(env), { limits: limitsFromEnv(env2), enabled: translateOn(env) }));
      } catch (error) {
        console.error(JSON.stringify({ message: "admin translation failed", error: error instanceof Error ? error.message : String(error) }));
        return json({ error: "translation_failed" }, 500);
      }
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found" }, 404);
    }

    const lang = langFromUrl(url);
    const route = resolveRoute(url);
    const portal = (page: SnapshotPage, live: () => Promise<Response>) => serveSnapshot({
      request, page, lang, db: env.DB, cache: typeof caches === "undefined" ? undefined : caches.default, html, live,
      defer: ctx ? promise => ctx.waitUntil(promise) : undefined,
    });
    switch (route.kind) {
      case "home":
        return portal("home", () => portalHome(db, lang));
      case "deals":
        return dashboard(db, url.searchParams.get("expand") === "1", lang);
      case "channel":
        return url.searchParams.get("expand") === "1"
          ? dashboard(db, true, lang, route.channel)
          : portal(route.channel, () => dashboard(db, false, lang, route.channel));
      case "detail":
        return dealDetail(db, route.id, lang, url.origin);
      case "redirect":
        return new Response(null, { status: route.status, headers: { location: route.location } });
      case "notFound":
        return html(renderNotFound({ lang, path: url.pathname }), 404);
    }
  },

  async scheduled(controller, env): Promise<void> {
    const db = env.DB as unknown as QueryDb;
    console.log(JSON.stringify({ message: "cron", cron: controller.cron }));
    if (controller.cron === TRANSLATE_CRON) {
      // Separate invocation from collection, so translation never adds CPU to the collection run.
      const report = await runTranslation(db, translator(env), {
        limits: limitsFromEnv(env as unknown as Record<string, unknown>),
        enabled: translateOn(env),
      });
      console.log(JSON.stringify({ message: "translate", ...report }));
      return;
    }
    const sources = controller.cron === RADAR_CRON ? scheduledSources(controller.scheduledTime) : undefined;
    const report = await runCollection(db, { trigger: "cron", cron: controller.cron, sources });
    if (report.checks.some(check => check.ok)) await refreshSnapshots(env);
  },
} satisfies ExportedHandler<Env>;
