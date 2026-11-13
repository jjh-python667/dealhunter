import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL as NodeURL } from "node:url";
import { buildBoard } from "../src/board";
import {
  dealTermsVersion,
  feedbackHashes,
  feedbackWindowStart,
  isFeedbackBrowserId,
  isFeedbackTermsVersion,
  isFeedbackVote,
  publicFeedbackSummary,
  summarizeFeedback,
  type FeedbackAggregateRow,
} from "../src/feedback";
import { renderPage, uniqueDeals } from "../src/page";
import { langFromUrl, resolveRoute } from "../src/routes";
import type { Board, DealRecord, RunRecord, SourceCheck } from "../src/types";
import { renderDealDetail } from "../src/ui/detail";
import { renderHome } from "../src/ui/home";
import { renderNotFound } from "../src/ui/notfound";

type Snapshot = { generatedAt: string; board: Board; run: RunRecord | null; checks: SourceCheck[] };
const snapshot = JSON.parse(readFileSync(new NodeURL("../preview/snapshot.json", import.meta.url), "utf8")) as Snapshot;
const deals = uniqueDeals(snapshot.board);
const now = new Date(snapshot.generatedAt);
const port = Number(process.env.PORT || 43118);

const CSP =
  "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'self'";

/** Local-only in-memory feedback: refreshing the preview resets it. Never touches D1. */
type PreviewFeedback = {
  id: number;
  dealId: string;
  termsVersion: string;
  vote: string;
  browserHash: string;
  networkHash: string;
  createdAt: string;
};
const feedbackRows: PreviewFeedback[] = [];
let feedbackSequence = 0;

function previewFeedback(dealId: string, termsVersion: string) {
  const since = feedbackWindowStart(new Date());
  const rows = feedbackRows.filter((row) => row.dealId === dealId && row.termsVersion === termsVersion && row.createdAt >= since);
  const grouped: FeedbackAggregateRow[] = (["works", "expired", "unknown"] as const)
    .map((vote) => {
      const subset = rows.filter((row) => row.vote === vote);
      return {
        vote,
        total: subset.length,
        browsers: new Set(subset.map((row) => row.browserHash)).size,
        networks: new Set(subset.map((row) => row.networkHash)).size,
        last_at: subset.length ? subset[subset.length - 1]!.createdAt : null,
      };
    })
    .filter((row) => row.total > 0);
  return summarizeFeedback(grouped);
}

function send(response: ServerResponse, status: number, body: string, type = "text/html; charset=utf-8") {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  send(response, status, JSON.stringify(data), "application/json; charset=utf-8");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleFeedback(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }
  let payload: Record<string, unknown> | null = null;
  try {
    const value = await readJson(request);
    payload = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    payload = null;
  }
  if (!payload) {
    sendJson(response, 400, { error: "invalid_payload" });
    return;
  }
  const dealId = typeof payload.dealId === "string" ? payload.dealId.trim() : "";
  const vote = payload.vote;
  const browserId = payload.browserId;
  const termsVersion = payload.termsVersion;
  if (!dealId || dealId.length > 160) return sendJson(response, 400, { error: "invalid_deal" });
  if (!isFeedbackVote(vote)) return sendJson(response, 400, { error: "invalid_vote" });
  if (!isFeedbackBrowserId(browserId)) return sendJson(response, 400, { error: "invalid_browser" });
  if (!isFeedbackTermsVersion(termsVersion)) return sendJson(response, 400, { error: "invalid_version" });
  const deal = deals.find((item: DealRecord) => item.id === dealId);
  if (!deal) return sendJson(response, 404, { error: "deal_not_found" });
  const currentVersion = dealTermsVersion(deal);
  if (currentVersion !== termsVersion) {
    return sendJson(response, 409, { error: "stale_version", summary: publicFeedbackSummary(previewFeedback(deal.id, currentVersion)) });
  }
  const at = new Date();
  const { browserHash, networkHash } = await feedbackHashes({
    browserId,
    networkKey: request.socket.remoteAddress ?? "local",
    now: at,
    pepper: process.env.FEEDBACK_PEPPER || "local-preview-pepper",
  });
  const existing = feedbackRows.some((row) => row.dealId === deal.id && row.termsVersion === currentVersion && row.browserHash === browserHash);
  if (!existing) {
    feedbackRows.push({
      id: ++feedbackSequence,
      dealId: deal.id,
      termsVersion: currentVersion,
      vote,
      browserHash,
      networkHash,
      createdAt: at.toISOString(),
    });
  }
  sendJson(response, 200, { ok: true, created: !existing, vote, summary: publicFeedbackSummary(previewFeedback(deal.id, currentVersion)) });
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/feedback") {
      await handleFeedback(request, response);
      return;
    }
    const route = resolveRoute(url);
    const lang = langFromUrl(url);
    if (route.kind === "redirect") {
      response.writeHead(route.status, { location: route.location, "cache-control": "no-store" });
      response.end();
      return;
    }
    if (route.kind === "notFound") {
      send(response, 404, renderNotFound({ lang, path: url.pathname, preview: true }));
      return;
    }
    if (route.kind === "detail") {
      const deal = deals.find((item: DealRecord) => item.id === route.id);
      if (!deal) {
        send(response, 404, renderNotFound({ lang, path: url.pathname, preview: true }));
        return;
      }
      const feedback = previewFeedback(deal.id, dealTermsVersion(deal));
      send(response, 200, renderDealDetail({ deal, now, lang, origin: `http://127.0.0.1:${port}`, preview: true, feedback }));
      return;
    }
    if (route.kind === "home") {
      send(response, 200, renderHome({ deals, now, lang, run: snapshot.run, preview: true }));
      return;
    }
    const board = buildBoard(deals as DealRecord[], now);
    send(
      response,
      200,
      renderPage({
        board,
        deals,
        checks: snapshot.checks,
        run: snapshot.run,
        now,
        expand: false,
        lang,
        preview: true,
        channel: route.kind === "channel" ? route.channel : undefined,
      }),
    );
  } catch (error) {
    console.error("preview request failed", error);
    if (!response.headersSent) send(response, 500, "本机预览暂时出错。", "text/plain; charset=utf-8");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Deal Hunter 本机预览 http://127.0.0.1:${port}/ （只读快照，不调用采集或模型）`);
  console.log(`首页 / · 全部情报 /deals · AI 工具 /ai-tools · 云服务 /cloud · 详情 /deal/<id>`);
  console.log(`领取状态反馈在本机内存中模拟（POST /api/feedback），刷新进程即清空。`);
});
