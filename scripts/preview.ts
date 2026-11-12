import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { URL as NodeURL } from "node:url";
import { buildBoard } from "../src/board";
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
  "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'";

function send(response: import("node:http").ServerResponse, status: number, body: string, type = "text/html; charset=utf-8") {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
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
    send(response, 200, renderDealDetail({ deal, now, lang, origin: `http://127.0.0.1:${port}`, preview: true }));
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
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Deal Hunter 本机预览 http://127.0.0.1:${port}/ （只读快照，不调用采集或模型）`);
  console.log(`首页 / · 全部情报 /deals · AI 工具 /ai-tools · 云服务 /cloud · 详情 /deal/<id>`);
});
