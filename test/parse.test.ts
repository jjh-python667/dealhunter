import assert from "node:assert/strict";
import test from "node:test";
import { dealExcerptFromItem, parseFeed } from "../src/parse";
import { matchPage, SOURCES } from "../src/sources";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
<item><title>NEXO is available for trading</title><link>https://blog.example/nexo?utm_source=rss</link><pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate><description>Trading is open.</description></item>
<item><title>Reflection's Beam is freely available for a limited time</title><link>https://example.com/beam?ref=invite</link><pubDate>Wed, 21 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[Beam is free for a limited time only.]]></description></item>
<item><title>Use-After-Free patched</title><link>https://example.com/cve</link><description>A Remote Use-After-Free was fixed.</description></item>
</channel></rss>`;

test("rss items keep dates and only deal-like copy becomes an excerpt", () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 3);
  assert.equal(items[0]?.publishedAt?.startsWith("2026-10-22"), true);
  assert.equal(dealExcerptFromItem(items[0]!), null);
  assert.match(dealExcerptFromItem(items[1]!) ?? "", /limited time/);
  assert.equal(dealExcerptFromItem(items[2]!), null);
});

test("CDATA titles are kept and excerpts do not drop the first letter", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Generate longer videos at no cost.]]></title><link>https://example.com/vids</link><description><![CDATA[Anyone can try it at no cost.]]></description></item></channel></rss>`;
  const items = parseFeed(rss);
  assert.equal(items[0]?.title, "Generate longer videos at no cost.");
  assert.match(dealExcerptFromItem(items[0]!) ?? "", /^Generate/);
});

test("atom links prefer the alternate href", () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title>Up to 90% off cached prompts</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://www.digitalocean.com/blog/cache?utm_medium=feed"/><published>2026-10-23T16:48:34.000Z</published><summary>Prompt caching is up to 90% off.</summary></entry>
</feed>`;
  const items = parseFeed(atom);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.link, "https://www.digitalocean.com/blog/cache?utm_medium=feed");
  assert.match(dealExcerptFromItem(items[0]!) ?? "", /90% off/);
});

test("official page patterns keep the verbatim sentence or keep nothing", () => {
  const claude = SOURCES.find((source) => source.id === "claude-pricing");
  const hits = matchPage("Plans Free Try Claude $0 Free for everyone Try Claude Limited usage every 5 hours and every week Chat", claude!);
  assert.equal(hits.length, 1);
  assert.match(hits[0]!, /\$0 Free for everyone/);
  assert.equal(matchPage("Pricing page without the free plan sentence", claude!).length, 0);

  const pack = SOURCES.find((source) => source.id === "github-student-pack");
  const offers = matchPage(
    "Noise Offer $50 in MongoDB Atlas Credits, plus access to Compass. Later Offer $10 in Example Credits for students.",
    pack!,
  );
  assert.equal(offers.length, 2);
  assert.match(offers[0]!, /\$50/);
});
