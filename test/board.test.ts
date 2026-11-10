import assert from "node:assert/strict";
import test from "node:test";
import { buildBoard } from "../src/board";
import type { DealRecord } from "../src/types";

function deal(overrides: Partial<DealRecord>): DealRecord {
  return {
    id: overrides.id ?? "1",
    title: overrides.title ?? "title",
    category: overrides.category ?? "ai",
    summary: overrides.summary ?? "summary",
    valueText: overrides.valueText ?? "",
    valueAmount: overrides.valueAmount ?? null,
    valueCurrency: overrides.valueCurrency ?? null,
    valueTier: overrides.valueTier ?? "unverified",
    conditions: overrides.conditions ?? "",
    regions: overrides.regions ?? "",
    startsAt: overrides.startsAt ?? null,
    endsAt: overrides.endsAt ?? null,
    timeText: overrides.timeText ?? "",
    steps: overrides.steps ?? "",
    officialUrl: overrides.officialUrl ?? "https://example.com/offer",
    sourceName: overrides.sourceName ?? "Example",
    sourceUrl: overrides.sourceUrl ?? "https://example.com/feed",
    sourceId: overrides.sourceId ?? "example",
    lastVerifiedAt: overrides.lastVerifiedAt ?? "2026-11-10T00:00:00Z",
    riskNote: overrides.riskNote ?? "",
    dealType: overrides.dealType ?? "unverified",
    status: overrides.status ?? "active",
    publishedAt: overrides.publishedAt ?? null,
    rankScore: overrides.rankScore ?? 0,
    firstSeenAt: overrides.firstSeenAt ?? "2026-11-10T01:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-11-10T01:00:00Z",
    archiveReason: overrides.archiveReason ?? "",
  };
}

test("sections split today, rank, categories, deadlines, and the archive", () => {
  const now = new Date("2026-11-10T02:00:00Z");
  const board = buildBoard(
    [
      deal({ id: "today", title: "today", publishedAt: "2026-11-09T18:00:00Z", rankScore: 10, category: "ai" }),
      deal({ id: "old", title: "old", publishedAt: "2026-10-01T00:00:00Z", rankScore: 1300, category: "vps", valueText: "$300" }),
      deal({ id: "soon", title: "soon", publishedAt: "2026-10-02T00:00:00Z", endsAt: "2026-11-12", category: "crypto", riskNote: "risk" }),
      deal({ id: "bank", title: "bank", category: "bank", rankScore: 100, publishedAt: "2026-10-03T00:00:00Z" }),
      deal({ id: "card", title: "card", category: "ucard", rankScore: 90, publishedAt: "2026-10-04T00:00:00Z" }),
      deal({ id: "soft", title: "soft", category: "software", rankScore: 80, publishedAt: "2026-10-05T00:00:00Z" }),
      deal({ id: "dead", title: "dead", status: "archived", archiveReason: "截止时间已过", endsAt: "2026-11-01" }),
      deal({ id: "stale", title: "stale", status: "active", endsAt: "2026-11-09", rankScore: 9999 }),
    ],
    now,
  );
  assert.deepEqual(board.sections.A.map((item) => item.id), ["today"]);
  assert.equal(board.sections.B[0]?.id, "old");
  assert.equal(board.sections.B.some((item) => item.id === "stale"), false);
  assert.deepEqual(board.sections.C.map((item) => item.id), ["today"]);
  assert.deepEqual(board.sections.D.map((item) => item.id), ["soon"]);
  assert.deepEqual(
    board.sections.E.map((item) => item.id),
    ["bank", "card"],
  );
  assert.deepEqual(board.sections.F.map((item) => item.id), ["old"]);
  assert.deepEqual(board.sections.G.map((item) => item.id), ["soon"]);
  assert.ok(board.sections.H.some((item) => item.id === "dead"));
  assert.ok(board.sections.H.some((item) => item.id === "stale"));
  assert.equal(board.sections.B.some((item) => item.rankScore === 0 && item.id === "soon"), true);
  assert.ok(board.sections.B.findIndex((item) => item.id === "old") < board.sections.B.findIndex((item) => item.id === "soon"));
  assert.equal(board.sections.F.some((item) => item.id === "soft"), false);
  assert.equal(board.activeCount, 6);
});

test("a timestamp just after 16:00 UTC belongs to the next Beijing day", () => {
  const before = buildBoard([deal({ id: "edge", publishedAt: "2026-11-10T15:30:00Z" })], new Date("2026-11-10T15:30:00Z"));
  const after = buildBoard([deal({ id: "edge", publishedAt: "2026-11-10T16:30:00Z" })], new Date("2026-11-10T16:30:00Z"));
  assert.equal(before.sections.A.length, 1);
  assert.equal(after.sections.A.length, 1);
  const nextMorning = buildBoard([deal({ id: "edge", publishedAt: "2026-11-10T15:30:00Z" })], new Date("2026-11-10T16:30:00Z"));
  assert.equal(nextMorning.sections.A.length, 0);
});
