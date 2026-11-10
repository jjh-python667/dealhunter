import assert from "node:assert/strict";
import test from "node:test";
import { adminDecision, tokensMatch } from "../src/auth";

test("ADMIN_TOKEN gate rejects missing, empty, and wrong tokens", async () => {
  assert.equal(await tokensMatch("right", ""), false);
  assert.equal(await tokensMatch("", "right"), false);
  assert.equal(await tokensMatch("wrong", "right"), false);
  assert.equal(await tokensMatch("right", "right"), true);
  assert.equal(await adminDecision(new Request("https://dealhunter.local/api/admin/collect"), undefined), "unconfigured");
  assert.equal(await adminDecision(new Request("https://dealhunter.local/api/admin/collect"), ""), "unconfigured");
  assert.equal(
    await adminDecision(new Request("https://dealhunter.local/api/admin/collect", { headers: { authorization: "Bearer no" } }), "secret"),
    "unauthorized",
  );
  assert.equal(await adminDecision(new Request("https://dealhunter.local/api/admin/collect"), "secret"), "unauthorized");
  assert.equal(
    await adminDecision(
      new Request("https://dealhunter.local/api/admin/collect", { headers: { authorization: "Bearer secret" } }),
      "secret",
    ),
    "ok",
  );
  assert.equal(
    await adminDecision(new Request("https://dealhunter.local/api/admin/collect", { headers: { "x-admin-token": "secret" } }), "secret"),
    "ok",
  );
});
