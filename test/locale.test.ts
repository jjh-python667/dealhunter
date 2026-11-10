import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildBoard } from "../src/board";
import { chineseCopy } from "../src/content/locale";
import { renderPage, uniqueDeals } from "../src/page";
import type { Board } from "../src/types";

const snapshot = JSON.parse(readFileSync("preview/snapshot.json", "utf8")) as { board: Board; generatedAt: string };
const rows = uniqueDeals(snapshot.board);
const azure = rows.find(row => row.sourceId === "azure-account")!;

test("every record in the supplied snapshot has a Chinese title, summary and introduction", () => {
  assert.equal(rows.length, 28);
  for (const row of rows) {
    const copy = chineseCopy(row);
    assert.match(copy.title, /[\u3400-\u9fff]/, row.sourceId);
    assert.match(copy.summary, /[\u3400-\u9fff]/, row.sourceId);
    assert.match(copy.intro, /[\u3400-\u9fff]/, row.sourceId);
    assert.equal(copy.edited, true);
    assert.equal(copy.machine, false);
  }
});

test("Chinese display never mutates the source records", () => {
  const original = JSON.stringify(azure);
  const copy = chineseCopy(azure);
  assert.notEqual(copy.title, azure.title);
  assert.equal(JSON.stringify(azure), original);
  assert.equal(copy.field(azure.conditions), copy.summary);
});

test("changed title or summary immediately invalidates the old edited translation", () => {
  for (const changed of [{...azure,title:azure.title+" Updated"},{...azure,summary:azure.summary+" Revised"}]) {
    const copy = chineseCopy(changed);
    assert.equal(copy.edited, false);
    assert.equal(copy.title, "");
    assert.equal(copy.summary, "");
  }
});

test("stored model translations retain priority over edited fallback copy", () => {
  const copy = chineseCopy({...azure,zhTitle:"后台提供的中文标题",zhSummary:"后台提供的中文摘要"});
  assert.equal(copy.title,"后台提供的中文标题");
  assert.equal(copy.summary,"后台提供的中文摘要");
  assert.equal(copy.machine,true);
});

test("unknown metadata is not guessed and an explicit deadline is not called missing", () => {
  assert.equal(chineseCopy(azure).field(""),undefined);
  assert.equal(chineseCopy(azure).field("New eligibility requirement"),undefined);
  const vercel = rows.find(row=>row.sourceId==="vercel-changelog")!;
  const now=new Date(snapshot.generatedAt);
  const html=renderPage({board:buildBoard([vercel],now),deals:[vercel],checks:[],run:null,now,expand:false});
  assert.doesNotMatch(html,/未给出日历截止日/);
  assert.match(html,/本站中文整理/);
  assert.doesNotMatch(html,/class="mt t-zh"[^>]*>机器翻译/);
});
