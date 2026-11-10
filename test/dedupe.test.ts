import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, sanitizeUrl } from "../src/url";

test("tracking and invite parameters do not create a second deal", async () => {
  const clean = sanitizeUrl("https://Example.com/offers/spring/?id=1&utm_source=newsletter&ref=abc");
  const again = sanitizeUrl("https://example.com/offers/spring?ref=zzz&id=1&utm_campaign=june");
  assert.equal(clean, again);
  assert.equal(clean.includes("utm_"), false);
  assert.equal(clean.includes("ref="), false);
  assert.equal(await fingerprint([`url:${clean}`]), await fingerprint([`url:${again}`]));
});

test("affiliate hosts and invite paths are dropped", () => {
  assert.equal(sanitizeUrl("https://sjv.io/abc?url=https://example.com"), "");
  assert.equal(sanitizeUrl("https://example.com/invite/friend"), "");
  assert.equal(sanitizeUrl("https://example.com/referral/abc"), "");
  assert.equal(sanitizeUrl("javascript:alert(1)"), "");
});

test("different official urls stay distinct", async () => {
  const left = await fingerprint([`url:${sanitizeUrl("https://example.com/a")}`]);
  const right = await fingerprint([`url:${sanitizeUrl("https://example.com/b")}`]);
  assert.notEqual(left, right);
});

test("amazon tag parameters are stripped", () => {
  const url = sanitizeUrl("https://www.amazon.com/dp/B000000?tag=affiliate-20&th=1");
  assert.equal(url.includes("tag="), false);
  assert.equal(url.includes("th=1"), true);
});
