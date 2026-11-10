import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { URL as NodeURL } from "node:url";
import { buildBoard } from "../src/board";
import { renderPage, uniqueDeals } from "../src/page";
import type { Board, DealRecord, RunRecord, SourceCheck } from "../src/types";

type Snapshot = { generatedAt: string; board: Board; run: RunRecord | null; checks: SourceCheck[] };
const snapshot = JSON.parse(readFileSync(new NodeURL("../preview/snapshot.json", import.meta.url), "utf8")) as Snapshot;
const deals = uniqueDeals(snapshot.board);
const now = new Date(snapshot.generatedAt);
const port = Number(process.env.PORT || 43118);
const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname !== "/") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const board = buildBoard(deals as DealRecord[], now);
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'",
    "x-content-type-options": "nosniff", "referrer-policy": "no-referrer",
  });
  response.end(renderPage({board,deals,checks:snapshot.checks,run:snapshot.run,now,expand:false,
    lang:url.searchParams.get("lang") === "en" ? "en" : "zh",preview:true}));
});
server.listen(port,"127.0.0.1",() => console.log(`Deal Hunter 本机预览 http://127.0.0.1:${port}/ （只读快照，不调用采集或模型）`));
