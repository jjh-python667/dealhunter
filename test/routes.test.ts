import assert from "node:assert/strict";
import test from "node:test";
import { CHANNELS, isChannelKey, langFromUrl, resolveRoute } from "../src/routes";

function at(path: string): URL {
  return new URL(path, "https://dealhunter.example");
}

test("portal routes resolve to their own pages", () => {
  assert.deepEqual(resolveRoute(at("/")), { kind: "home" });
  assert.deepEqual(resolveRoute(at("/deals")), { kind: "deals" });
  assert.deepEqual(resolveRoute(at("/ai-tools")), { kind: "channel", channel: "ai" });
  assert.deepEqual(resolveRoute(at("/cloud")), { kind: "channel", channel: "cloud" });
  assert.deepEqual(resolveRoute(at("/deal/abc123")), { kind: "detail", id: "abc123" });
});

test("trailing slashes point at the same page", () => {
  assert.deepEqual(resolveRoute(at("/deals/")), { kind: "deals" });
  assert.deepEqual(resolveRoute(at("/ai-tools/")), { kind: "channel", channel: "ai" });
  assert.equal(resolveRoute(at("/deal/")).kind, "notFound");
});

test("pre-portal dashboard links are redirected without losing filters", () => {
  const route = resolveRoute(at("/?view=saved&q=AI&category=ai&type=free&sort=rank&page=2&evidence=region&lang=en"));
  assert.equal(route.kind, "redirect");
  if (route.kind !== "redirect") return;
  assert.equal(route.status, 302);
  assert.equal(
    route.location,
    "/deals?view=saved&q=AI&category=ai&type=free&sort=rank&page=2&evidence=region&lang=en",
  );
});

test("the old expanded-offer link keeps working through the dashboard", () => {
  const route = resolveRoute(at("/?offer=abc123"));
  assert.equal(route.kind, "redirect");
  if (route.kind !== "redirect") return;
  assert.equal(route.location, "/deals?offer=abc123");
});

test("language only does not bounce the homepage", () => {
  assert.deepEqual(resolveRoute(at("/?lang=en")), { kind: "home" });
  assert.equal(langFromUrl(at("/?lang=en")), "en");
  assert.equal(langFromUrl(at("/")), "zh");
});

test("detail ids are decoded but cannot escape the deal path", () => {
  assert.deepEqual(resolveRoute(at("/deal/abc%2D123")), { kind: "detail", id: "abc-123" });
  // The URL parser resolves dot segments (even encoded ones) before the route
  // sees them; what is left must never become a path traversal or empty id.
  for (const bad of ["/deal/", "/deal/a%2Fb", "/deal/%00", "/deal/a b", "/deal/%2e%2e%2f"]) {
    assert.equal(resolveRoute(at(bad)).kind, "notFound", bad);
  }
});

test("unknown paths and api paths are not silently mapped to the homepage", () => {
  for (const path of ["/favicon.ico", "/admin", "/deal", "/ai-tools/extra", "/api/health"]) {
    assert.equal(resolveRoute(at(path)).kind, "notFound", path);
  }
});

test("both channels are directly addressable and carry their own filter metadata", () => {
  assert.equal(isChannelKey("ai"), true);
  assert.equal(isChannelKey("vps"), false);
  assert.equal(CHANNELS.ai.path, "/ai-tools");
  assert.equal(CHANNELS.ai.category, "ai");
  assert.equal(CHANNELS.cloud.path, "/cloud");
  assert.equal(CHANNELS.cloud.category, "vps");
  assert.equal(CHANNELS.cloud.navKey, "cloud");
});
