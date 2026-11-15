import assert from "node:assert/strict";
import test from "node:test";
import { renderNotFound, renderServiceUnavailable } from "../src/ui/notfound";

test("a missing deal and an unknown page use different Chinese copy", () => {
  const deal = renderNotFound({ path: "/deal/missing", lang: "zh" });
  assert.match(deal, /<html lang="zh-CN" data-lang="zh">/);
  assert.match(deal, /<title>没有找到这条优惠 · GLOBAL DEAL HUNTER<\/title>/);
  assert.match(deal, /<h1>没有找到这条优惠<\/h1>/);
  assert.match(deal, /href="\/deals\?view=archived"/);
  assert.match(deal, /name="robots" content="noindex"/);

  for (const path of ["/sitemap.xml", "/admin"]) {
    const page = renderNotFound({ path, lang: "zh" });
    assert.match(page, /<title>没有找到这个页面 · GLOBAL DEAL HUNTER<\/title>/, path);
    assert.match(page, /<h1>没有找到这个页面<\/h1>/, path);
    assert.match(page, /回到首页/);
    assert.match(page, /浏览全部情报/);
    assert.doesNotMatch(page, /没有找到这条优惠/, path);
    assert.match(page, /name="robots" content="noindex"/);
  }
});

test("English 404 pages do not keep the Chinese missing-offer copy", () => {
  const deal = renderNotFound({ path: "/deal/missing", lang: "en" });
  const page = renderNotFound({ path: "/sitemap.xml", lang: "en" });
  for (const html of [deal, page]) {
    assert.match(html, /<html lang="en" data-lang="en">/);
    assert.doesNotMatch(html, /没有找到/);
    assert.match(html, /name="robots" content="noindex"/);
    assert.match(html, /Skip to content/);
  }
  assert.match(deal, /<h1>This offer was not found<\/h1>/);
  assert.match(deal, /View ended archive/);
  assert.match(page, /<h1>Page not found<\/h1>/);
  assert.match(page, /go back home or browse all deals/i);
  assert.doesNotMatch(page, /This offer was not found/);
});

test("a 503 stays distinct from a missing offer in both languages", () => {
  const zh = renderServiceUnavailable({ path: "/deal/live", lang: "zh" });
  assert.match(zh, /<h1>数据暂时不可用，请稍后再试<\/h1>/);
  assert.match(zh, /503 · SERVICE UNAVAILABLE/);
  assert.match(zh, /不是链接失效/);
  assert.match(zh, /href="\/deal\/live">重新加载/);
  assert.doesNotMatch(zh, /没有找到这条优惠/);

  const en = renderServiceUnavailable({ path: "/deal/live", lang: "en" });
  assert.match(en, /<html lang="en" data-lang="en">/);
  assert.match(en, /<h1>Data is temporarily unavailable\. Please try again shortly\.<\/h1>/);
  assert.match(en, /has not expired/);
  assert.match(en, /503 · SERVICE UNAVAILABLE/);
  assert.match(en, /href="\/deal\/live">Reload/);
  assert.doesNotMatch(en, /没有找到|This offer was not found|Page not found/);
});
