import { adminDecision } from "./auth";
import { buildBoard } from "./board";
import { runCollection } from "./collect";
import {
  checksForRun,
  collectionToken,
  getDeal,
  lastSuccessfulSourceChecks,
  latestRun,
  listDeals,
  recentSourceChecks,
  sourcePerformance,
  type QueryDb,
} from "./db";
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
    const deal = await getDeal(db, id);
    if (!deal) return html(renderNotFound({ lang, path: `/deal/${id}` }), 404);
    return html(renderDealDetail({ deal, now: new Date(), lang, origin }));
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
