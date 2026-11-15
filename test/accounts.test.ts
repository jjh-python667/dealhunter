import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test, { type TestContext } from "node:test";
import worker from "../src/index";

const origin = "https://dealhunter.example";
const start = "/api/auth/github/start";
const now = Date.parse("2026-11-15T08:00:00Z");
const schema = readFileSync("migrations/0007_accounts.sql", "utf8");
const hash = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");

function setup(t: TestContext) {
  t.mock.timers.enable({apis: ["Date"], now});
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(schema);
  const prepare = (sql: string, args: SQLInputValue[] = []) => ({
    bind: (...values: SQLInputValue[]) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    run: async () => sqlite.prepare(sql).run(...args),
    execute: () => ({results: sqlite.prepare(sql).all(...args)}),
  });
  const batch = async (statements: Array<ReturnType<typeof prepare>>) => {
    sqlite.exec("BEGIN");
    try {
      const results = statements.map(s => s.execute());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  };
  const env = {DB: {prepare, batch}, ACCOUNTS_ENABLED: "1",
    GITHUB_CLIENT_ID: "mock-client", GITHUB_CLIENT_SECRET: "mock-secret", SESSION_PEPPER: "mock-pepper"} as unknown as Env;
  const calls: string[] = [];
  let login = "octocat";
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    calls.push(String(input));
    if (input === "https://github.com/login/oauth/access_token") {
      const body = init.body as URLSearchParams;
      assert.equal(body.get("code"), "test-code");
      assert.match(body.get("code_verifier") ?? "", /^[A-Za-z0-9_-]{43}$/);
      assert.equal(body.get("redirect_uri"), origin + "/api/auth/github/callback");
      return Response.json({access_token: "mock-transient-token"});
    }
    assert.equal(input, "https://api.github.com/user");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer mock-transient-token");
    return Response.json({id: 123, login, email: "ignored@example.test"});
  });
  const get = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(origin + path, init) as Parameters<typeof worker.fetch>[0], env);
  return {sqlite, calls, get, rename: (value: string) => { login = value; }};
}

function cookiePair(response: Response, name: string): string {
  const line = response.headers.getSetCookie().find(value => value.startsWith(name + "="));
  assert.ok(line);
  return line.split(";")[0]!;
}

async function initiate(get: ReturnType<typeof setup>["get"], returnTo = "/account?lang=en") {
  const response = await get(start + "?return=" + encodeURIComponent(returnTo));
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get("location")!);
  const state = target.searchParams.get("state")!;
  return {response, target, state, cookie: cookiePair(response, "__Host-dh_oauth")};
}

function callback(get: ReturnType<typeof setup>["get"], state: string, cookie: string) {
  return get("/api/auth/github/callback?code=test-code&state=" + state, {headers: {cookie}});
}

test("feature-off public HTML matches the main 0cb71b4 bytes in both languages", async t => {
  t.mock.timers.enable({apis:["Date"], now});
  const db = {prepare() { return {bind() { return this; }, async first() { return null; }, async all() { return {results:[]}; }}; }};
  const env = {DB: db, ACCOUNTS_ENABLED:"0"} as unknown as Env;
  const snapshots = {
    "/": ["cbd49198570236c4f973e85cbfd6eaf0c18f29d6eced596f8875860f97ad3854", "5c6e4dc6750be451eca982b0c5ef05bc072614ff9584c02bb4fd8d6eab045d7f"],
    "/deals": ["c5e5607248db79872bdc1412cb316e3b1ed12014bbe383a4f41f3c8d64d7c22f", "d6e1ab68c440652b7722403829a33618b85e880664eaa299271a7b0fb1034738"],
    "/ai-tools": ["a52bd8b35822682ce84fa59288290d9c32ab151e5ef77a84d480b2cd595729e8", "0dfacec617b69be852b864e4a51a5a884f8b76e841c05393c3c86b552a586121"],
    "/cloud": ["b7791fb21684acbfdac6e768e413e90aaf9836e36292242a55cb90a69de78609", "4e6fb09d3f6840da52e9caa60b317e6c9633c283885f00a39d558b792c861e83"],
    "/deal/missing": ["bf0ff3503743e5c686517c5dd08395248ce0f4dc8b45aaeb632b144645b5c728", "917d1dc4f15cbf25eb07da0ff430215acb44d42f2717a2d76eddd609aafed2fa"],
    "/missing": ["6d8026daa4bd9988b5450aefc9016aa8c1024252e8a7282c1348f95beb31aa22", "6caaad23abb03e8b69635339fa08160e73a43bc4d1ed97a109de502c7a433d7a"],
  };
  for (const [path, [zh, en]] of Object.entries(snapshots)) {
    for (const [lang, expected] of [["zh", zh], ["en", en]]) {
      const response = await worker.fetch(new Request(origin + path + "?lang=" + lang), env);
      assert.equal(hash(new Uint8Array(await response.arrayBuffer())), expected, path + " " + lang);
    }
  }
  for (const path of [start, "/api/auth/github/callback", "/api/auth/logout", "/api/me", "/api/me/saved", "/account"]) {
    assert.equal((await worker.fetch(new Request(origin + path), env)).status, 404, path);
  }
});

test("OAuth start sets a host-only cookie, derives S256, sanitizes returns and rate limits attempt 11", async t => {
  const {get, sqlite, calls} = setup(t);
  for (const path of ["//evil.example", "https://evil.example", "/\\evil.example", "/.//evil.example"]) {
    const flow = await initiate(get, path);
    assert.equal(flow.target.searchParams.get("code_challenge_method"), "S256");
    assert.equal(flow.target.searchParams.has("scope"), false);
    const row = sqlite.prepare("SELECT * FROM oauth_states WHERE state_hash=?").get(hash(flow.state))!;
    assert.equal(row.return_to, "/");
    assert.equal(flow.target.searchParams.get("code_challenge"), createHash("sha256").update(String(row.code_verifier)).digest("base64url"));
    assert.match(flow.response.headers.get("set-cookie")!, /^__Host-dh_oauth=.*; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
  }
  for (let attempt = 5; attempt <= 10; attempt++) await initiate(get);
  assert.equal((await get(start)).status, 429);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM oauth_states").get()?.n, 10);
  assert.deepEqual(calls, []);
});

test("callback consumes state once, rejects expired or unbound state and stores only session hashes", async t => {
  const {get, sqlite, calls, rename} = setup(t);
  const flow = await initiate(get);
  assert.equal((await callback(get, flow.state, "__Host-dh_oauth=wrong")).headers.get("location"), "/account?login=error");
  assert.equal((await callback(get, flow.state, flow.cookie)).headers.get("location"), "/account?lang=en&login=ok");
  const replay = await callback(get, flow.state, flow.cookie);
  assert.equal(replay.headers.get("location"), "/account?login=error");
  assert.equal(calls.length, 2);
  const expired = await initiate(get);
  t.mock.timers.tick(600_001);
  assert.equal((await callback(get, expired.state, expired.cookie)).headers.get("location"), "/account?login=error");
  const next = await initiate(get);
  rename("octocat-renamed");
  const success = await callback(get, next.state, next.cookie);
  assert.match(success.headers.getSetCookie()[1]!, /^__Host-dh_session=.*; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
  const session = cookiePair(success, "__Host-dh_session");
  for (const [table, count] of [["users",1], ["identities",1], ["sessions",2]]) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n, count);
  }
  assert.ok(sqlite.prepare("SELECT token_hash FROM sessions WHERE token_hash=?").get(hash("mock-pepper" + session.split("=")[1])));
  assert.deepEqual(await (await get("/api/me")).json(), {user:null});
  const me = await get("/api/me", {headers:{cookie: session}});
  assert.match(me.headers.get("cache-control")!, /no-store, private/);
  assert.deepEqual(await me.json(), {user:{login:"octocat-renamed"}});
  t.mock.timers.tick(30 * 86_400_000 + 1);
  const ended = await get("/api/me", {headers:{cookie: session}});
  assert.deepEqual(await ended.json(), {user:null});
  assert.match(ended.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(calls.length, 4);
});

test("session rotation allows the old cookie for 60 seconds and logout enforces CSRF", async t => {
  const {get} = setup(t);
  const flow = await initiate(get);
  const first = cookiePair(await callback(get, flow.state, flow.cookie), "__Host-dh_session");
  t.mock.timers.tick(7 * 86_400_000);
  const rotated = cookiePair(await get("/api/me", {headers:{cookie:first}}), "__Host-dh_session");
  assert.notEqual(first, rotated);
  const old = await get("/api/me", {headers:{cookie:first}});
  assert.deepEqual(await old.json(), {user:{login:"octocat"}});
  assert.equal(old.headers.has("set-cookie"), false);
  t.mock.timers.tick(60_001);
  assert.deepEqual(await (await get("/api/me", {headers:{cookie:first}})).json(), {user:null});
  const invalidHeaders: Array<Record<string, string>> = [
    {"x-dh-csrf":"1"}, {"x-dh-csrf":"1", origin:"null"}, {"x-dh-csrf":"1", origin:"https://other.example"},
    {origin}, {"x-dh-csrf":"1", origin, "content-type":"text/plain"},
  ];
  for (const headers of invalidHeaders) {
    const response = await get("/api/auth/logout", {method:"POST", headers:{"content-type":"application/json", cookie:rotated, ...headers}, body:"{}"});
    assert.equal(response.status, 403);
  }
  const logout = await get("/api/auth/logout", {method:"POST", headers:{"content-type":"application/json", "x-dh-csrf":"1", origin, cookie:rotated}, body:"{}"});
  assert.equal(logout.status, 200);
  assert.deepEqual(await (await get("/api/me", {headers:{cookie:rotated}})).json(), {user:null});
});

test("session sliding writes at most hourly and absolute expiry wins", async t => {
  const {get, sqlite} = setup(t);
  const flow = await initiate(get);
  const cookie = cookiePair(await callback(get, flow.state, flow.cookie), "__Host-dh_session");
  const read = () => get("/api/me", {headers:{cookie}});
  const hour = 3600_000;
  const day = 24 * hour;
  t.mock.timers.tick(hour - 1);
  assert.equal((await read()).headers.has("set-cookie"), false);
  t.mock.timers.tick(1);
  assert.match((await read()).headers.get("set-cookie")!, /Max-Age=2592000/);
  sqlite.prepare("UPDATE sessions SET created_at=?, expires_at=?")
    .run(new Date(now - 180 * day + 2 * hour).toISOString(), new Date(now + 30 * day).toISOString());
  t.mock.timers.tick(hour);
  const ended = await read();
  assert.deepEqual(await ended.json(), {user:null});
  assert.match(ended.headers.get("set-cookie")!, /Max-Age=0/);
});

test("account fallback has bilingual GitHub links and its HTML is independent of session cookies", async t => {
  const {get} = setup(t);
  for (const [lang, copy] of [["zh","用 GitHub 登录"], ["en","Continue with GitHub"]]) {
    const page = await get("/account?lang=" + lang);
    const html = await page.text();
    assert.ok(html.includes(copy));
    assert.match(html, /href="\/api\/auth\/github\/start\?/);
    assert.match(html, /label\.textContent = name/);
    assert.equal(await (await get("/account?lang=" + lang, {headers:{cookie:"__Host-dh_session=arbitrary"}})).text(), html);
  }
});

test("migration down removes only account tables and schema has functional foreign keys", t => {
  const {sqlite} = setup(t);
  sqlite.exec("CREATE TABLE existing_deals (id TEXT); INSERT INTO existing_deals VALUES ('preserved')");
  assert.throws(() => sqlite.exec("INSERT INTO identities(provider, subject, user_id, created_at) VALUES ('github','123','missing','now')"), /FOREIGN KEY/);
  sqlite.exec(readFileSync("migrations-down/0007_accounts.down.sql", "utf8"));
  assert.equal(sqlite.prepare("SELECT id FROM existing_deals").get()?.id, "preserved");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()?.n, 1);
});
