import { adminDecision } from "./auth";
import { buildBoard } from "./board";
import { runCollection } from "./collect";
import { checksForRun, latestRun, listDeals, type QueryDb } from "./db";
import { renderPage } from "./page";
import { TRANSLATE_CRON, limitsFromEnv, runTranslation, type TranslatorBinding } from "./translate";



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
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

async function dashboard(db: QueryDb, expand: boolean, lang: "zh" | "en"): Promise<Response> {
  try {
    const now = new Date();
    const [deals, run] = await Promise.all([listDeals(db), latestRun(db)]);
    const checks = run ? await checksForRun(db, run.id) : [];
    const board = buildBoard(deals, now);
    return html(renderPage({ board, deals, checks, run, now, expand, lang }));
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
      }),
      500,
    );
  }
}

export default {
  async fetch(request, env): Promise<Response> {
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
    if (url.pathname === "/") {
      return dashboard(db, url.searchParams.get("expand") === "1", url.searchParams.get("lang") === "en" ? "en" : "zh");
    }
    return json({ error: "not_found" }, 404);
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
    await runCollection(db, { trigger: "cron", cron: controller.cron });
  },
} satisfies ExportedHandler<Env>;
