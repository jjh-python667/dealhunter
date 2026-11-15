import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { runInNewContext } from "node:vm";
import test, { type TestContext } from "node:test";
import worker from "../src/index";
import { accountCopy } from "../src/accounts/copy";
import { ACCOUNT_SCRIPT } from "../src/ui/account-client";
import { ALERT_USER_BATCH, cleanupAccountAlerts, generateAccountAlerts } from "../src/accounts/alerts";
import { RADAR_CRON } from "../src/sources";
import { TRANSLATE_CRON } from "../src/translate";

const origin = "https://dealhunter.example";
const start = "/api/auth/github/start";
const now = Date.parse("2026-11-15T08:00:00Z");
type GitHubFetchMode = "ok" | "token-status" | "oauth-error" | "oauth-status" | "unsafe-error" | "user-status" | "user-invalid" | "redirect" | "throw";
const schema = readFileSync("migrations/0007_accounts.sql", "utf8");
const hash = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");

function setup(t: TestContext, alerts = false) {
  t.mock.timers.enable({apis: ["Date"], now});
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(schema);
  if (alerts) {
    for (const migration of ["0001_init", "0002_translation", "0008_alert_scan"]) {
      sqlite.exec(readFileSync("migrations/" + migration + ".sql", "utf8"));
    }
  }
  let failScan = false;
  const prepare = (sql: string, args: SQLInputValue[] = []) => {
    if (failScan && sql.includes("FROM users AS u LEFT JOIN alert_scan_progress")) throw Error("mock reminder failure");
    return {
    bind: (...values: SQLInputValue[]) => prepare(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({results: sqlite.prepare(sql).all(...args)}),
    run: async () => sqlite.prepare(sql).run(...args),
    execute: () => ({results: sqlite.prepare(sql).all(...args)}),
    };
  };
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
  const env = {DB: {prepare, batch}, ACCOUNTS_ENABLED: "1", ALERTS_SERVER_ENABLED: alerts ? "1" : "0",
    GITHUB_CLIENT_ID: "mock-client", GITHUB_CLIENT_SECRET: "mock-secret", SESSION_PEPPER: "mock-pepper"} as unknown as Env;
  const calls: string[] = [];
  const redirects: string[] = [];
  let login = "octocat";
  let mode: GitHubFetchMode = "ok";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const redirect = init?.redirect ?? (input instanceof Request ? input.redirect : undefined);
    if (redirect === "error") throw new TypeError('redirect mode "error" is not implemented');
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    redirects.push(redirect ?? "");
    if (mode === "throw") {
      const body = init?.body instanceof URLSearchParams ? init.body : null;
      throw new TypeError(`network ${body?.get("code_verifier") ?? ""} code=${body?.get("code") ?? ""} secret=mock-secret token=mock-transient-token client=mock-client`);
    }
    if (url === "https://github.com/login/oauth/access_token") {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("code"), "test-code");
      assert.match(body.get("code_verifier") ?? "", /^[A-Za-z0-9_-]{43}$/);
      assert.equal(body.get("redirect_uri"), origin + "/api/auth/github/callback");
      if (mode === "token-status") return new Response("client_secret=mock-secret code=test-code", {status: 401});
      if (mode === "oauth-error") return Response.json({
        error: "incorrect_client_credentials",
        error_description: "client_secret mock-secret code test-code",
        error_uri: "https://evil.example/docs?code=test-code",
      });
      if (mode === "oauth-status") return Response.json({error: "bad_verification_code", error_description: "code test-code"}, {status: 400});
      if (mode === "unsafe-error") return Response.json({error: "mock-secret-test-code", access_token: "mock-transient-token"});
      if (mode === "redirect") return new Response("mock-secret", {status: 302, headers: {location: "https://evil.example/steal?code=test-code"}});
      return Response.json({access_token: "mock-transient-token"});
    }
    assert.equal(url, "https://api.github.com/user");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer mock-transient-token");
    if (mode === "user-status") return new Response("token mock-transient-token", {status: 403});
    if (mode === "user-invalid") return Response.json({id: "123", login: "not a login"});
    return Response.json({id: 123, login, email: "ignored@example.test"});
  });
  const get = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(origin + path, init) as Parameters<typeof worker.fetch>[0], env);
  return {sqlite, env, calls, redirects, get, failScan: () => { failScan = true; },
    rename: (value: string) => { login = value; }, githubMode: (value: GitHubFetchMode) => { mode = value; }};
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
  const env = {DB: db, ACCOUNTS_ENABLED:"0", ALERTS_SERVER_ENABLED:"1"} as unknown as Env;
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
  for (const path of [start, "/api/auth/github/callback", "/api/auth/logout", "/api/me", "/api/me/saved", "/api/me/inbox", "/account"]) {
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
  assert.deepEqual((await me.json<{user:unknown}>()).user, {login:"octocat-renamed"});
  t.mock.timers.tick(30 * 86_400_000 + 1);
  const ended = await get("/api/me", {headers:{cookie: session}});
  assert.deepEqual(await ended.json(), {user:null});
  assert.match(ended.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(calls.length, 4);
});

test("GitHub callback stays on manual redirect, lands on login=ok, and sets a host session cookie", async t => {
  const {get, calls, redirects} = setup(t);
  const errors = t.mock.method(console, "error", () => {});
  await assert.rejects(() => fetch("https://github.com/login/oauth/access_token", {redirect: "error"}), TypeError);
  assert.deepEqual(calls, []);
  assert.deepEqual(redirects, []);
  const flow = await initiate(get);
  const success = await callback(get, flow.state, flow.cookie);
  const location = success.headers.get("location") ?? "";
  assert.match(location, /^\/account\?/);
  assert.equal(new URL(location, origin).searchParams.get("login"), "ok");
  const session = success.headers.getSetCookie().find(value => value.startsWith("__Host-dh_session="));
  assert.ok(session);
  assert.match(session, /^__Host-dh_session=[A-Za-z0-9_-]+; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
  assert.deepEqual(calls, ["https://github.com/login/oauth/access_token", "https://api.github.com/user"]);
  assert.deepEqual(redirects, ["manual", "manual"]);
  assert.equal(errors.mock.callCount(), 0);
});

test("GitHub login failures log a reason code and never a code, token, or secret", async t => {
  const {get, sqlite, calls, redirects, githubMode} = setup(t);
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  const scenarios = [
    ["token-status", "token_http_401", 1],
    ["oauth-error", "incorrect_client_credentials", 1],
    ["oauth-status", "bad_verification_code", 1],
    ["unsafe-error", "token_rejected", 1],
    ["redirect", "token_http_302", 1],
    ["user-status", "user_http_403", 2],
    ["user-invalid", "user_invalid", 2],
    ["throw", "TypeError", 1],
  ] as const;
  for (const [mode, reason, fetches] of scenarios) {
    githubMode(mode);
    calls.length = 0;
    redirects.length = 0;
    logged.length = 0;
    const flow = await initiate(get);
    const row = sqlite.prepare("SELECT code_verifier FROM oauth_states WHERE state_hash=?").get(hash(flow.state)) as {code_verifier: string} | undefined;
    assert.ok(row, mode);
    const response = await callback(get, flow.state, flow.cookie);
    assert.equal(response.headers.get("location"), "/account?login=error", mode);
    assert.equal(response.headers.getSetCookie().some(value => value.startsWith("__Host-dh_session=")), false, mode);
    assert.equal(calls.length, fetches, mode);
    assert.ok(calls.every(url => url === "https://github.com/login/oauth/access_token" || url === "https://api.github.com/user"), mode);
    assert.deepEqual(redirects, Array.from({length: fetches}, () => "manual"), mode);
    const text = JSON.stringify(logged);
    for (const secret of ["test-code", "mock-secret", "mock-transient-token", "mock-pepper", "mock-client", row.code_verifier, flow.state, "evil.example", "not a login"]) {
      assert.equal(text.includes(secret), false, `${mode} leaked a forbidden value`);
    }
    assert.deepEqual(logged, [["Deal Hunter GitHub login failed", reason]], mode);
  }
});

test("session rotation allows the old cookie for 60 seconds and logout enforces CSRF", async t => {
  const {get} = setup(t);
  const flow = await initiate(get);
  const first = cookiePair(await callback(get, flow.state, flow.cookie), "__Host-dh_session");
  t.mock.timers.tick(7 * 86_400_000);
  const rotated = cookiePair(await get("/api/me", {headers:{cookie:first}}), "__Host-dh_session");
  assert.notEqual(first, rotated);
  const old = await get("/api/me", {headers:{cookie:first}});
  assert.deepEqual((await old.json<{user:unknown}>()).user, {login:"octocat"});
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

test("account page shows prominent bilingual login success and failure banners", async t => {
  const {get} = setup(t);
  const zhError = await (await get("/account?lang=zh&login=error")).text();
  const enError = await (await get("/account?lang=en&login=error")).text();
  const zhOk = await (await get("/account?lang=zh&login=ok")).text();
  const enOk = await (await get("/account?lang=en&login=ok")).text();
  const plain = await (await get("/account?lang=zh")).text();
  const banner = (kind: "error" | "ok", text: string) =>
    `<p class="account-banner account-banner-${kind}" role="${kind === "error" ? "alert" : "status"}">${text}</p>`;
  assert.ok(zhError.includes(banner("error", "登录没有完成，请重试。")));
  assert.ok(enError.includes(banner("error", "Sign-in didn&#39;t finish. Please try again.")));
  assert.ok(zhOk.includes(banner("ok", "已用 GitHub 登录。")));
  assert.ok(enOk.includes(banner("ok", "Signed in with GitHub.")));
  assert.equal(zhError.includes('class="account-banner account-banner-ok"'), false);
  assert.equal(enOk.includes('class="account-banner account-banner-error"'), false);
  assert.equal(plain.includes('class="account-banner'), false);
  assert.ok(zhError.indexOf(banner("error", "登录没有完成，请重试。")) < zhError.indexOf('id="account-title"'));
  assert.ok(enOk.indexOf(banner("ok", "Signed in with GitHub.")) < enOk.indexOf('id="account-title"'));
});

test("migration down removes only account tables and schema has functional foreign keys", t => {
  const {sqlite} = setup(t);
  sqlite.exec("CREATE TABLE existing_deals (id TEXT); INSERT INTO existing_deals VALUES ('preserved')");
  assert.throws(() => sqlite.exec("INSERT INTO identities(provider, subject, user_id, created_at) VALUES ('github','123','missing','now')"), /FOREIGN KEY/);
  sqlite.exec(readFileSync("migrations-down/0007_accounts.down.sql", "utf8"));
  assert.equal(sqlite.prepare("SELECT id FROM existing_deals").get()?.id, "preserved");
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get()?.n, 1);
});

async function loginFor(t: TestContext, alerts = false) {
  const result = setup(t, alerts);
  const signIn = async () => {
    const flow = await initiate(result.get);
    return cookiePair(await callback(result.get, flow.state, flow.cookie), "__Host-dh_session");
  };
  const cookie = await signIn();
  const read = (path: string, session = cookie) => result.get(path, {headers: {cookie:session}});
  const write = (path: string, body: unknown, session = cookie) => result.get(path, {
    method:"POST", headers:{origin, cookie:session, "x-dh-csrf":"1", "content-type":"application/json"}, body: JSON.stringify(body),
  });
  return {...result, read, write, signIn};
}

test("merge skips duplicates and malformed IDs, honors tombstones and keeps prefs unless opted in", async t => {
  const {read, write, sqlite, signIn} = await loginFor(t);
  assert.equal((await write("/api/me/saved", {add:["a","b","gone"]})).status, 200);
  const secondSession = await signIn();
  const removed = await write("/api/me/saved", {remove:["gone"]});
  assert.equal(removed.status, 200);
  assert.equal(sqlite.prepare("SELECT deal_id FROM saved_tombstones").get()?.deal_id, "gone");
  assert.deepEqual(await (await read("/api/me/saved", secondSession)).json(), {ids:["a","b"]});
  const prefs = {region:"us", noCard:true};
  assert.equal((await write("/api/me/prefs", prefs)).status, 200);
  const merge = await write("/api/me/saved/merge", {ids:["b","c","bad id","c","gone"]});
  assert.deepEqual(await merge.json(), {ids:["a","b","c"], added:1, skipped:4, overflow:0});
  assert.equal((await (await read("/api/me/prefs")).json<{prefs:{region:string}}>()).prefs.region, "us");
  await write("/api/me/saved/merge", {ids:["c"], prefs:{region:"gb"}});
  assert.equal((await (await read("/api/me/prefs")).json<{prefs:{region:string}}>()).prefs.region, "gb");
  assert.equal((await write("/api/me/prefs", {channels:{email:true}})).status, 400);
});

test("merge caps saves at 1000, favors existing IDs, then preserves input priority", async t => {
  const {write} = await loginFor(t);
  const existing = Array.from({length:999}, (_, index) => "old" + index);
  assert.equal((await write("/api/me/saved", {add:existing})).status, 200);
  const response = await write("/api/me/saved/merge", {ids:["z-first", "a-second"]});
  const result = await response.json<{ids:string[]; added:number; overflow:number}>();
  assert.equal(result.ids.length, 1000);
  assert.ok(existing.every(id => result.ids.includes(id)));
  assert.ok(result.ids.includes("z-first"));
  assert.ok(!result.ids.includes("a-second"));
  assert.equal(result.added, 1);
  assert.equal(result.overflow, 1);
});

test("export omits credentials, all-device logout revokes both sessions and delete purges account data", async t => {
  const {write, read, signIn, sqlite} = await loginFor(t);
  const second = await signIn();
  const user = sqlite.prepare("SELECT id FROM users").get()!.id as string;
  await write("/api/me/saved", {add:["kept"], remove:["removed"]});
  await write("/api/me/prefs", {frequency:"daily"});
  sqlite.prepare("INSERT INTO alert_state VALUES (?, 'kept', 'revision')").run(user);
  sqlite.prepare("INSERT INTO alert_inbox(user_id,dedupe_key,kind,deal_id,created_at,day) VALUES (?,'test','ending','kept','test','2026-11-15')").run(user);
  const exported = await read("/api/me/export");
  assert.match(exported.headers.get("content-disposition")!, /dealhunter-export\.json/);
  const raw = await exported.text();
  assert.doesNotMatch(raw, /token|hash|secret|verifier|mergeKey|mock-transient/i);
  const data = JSON.parse(raw);
  for (const key of ["user","identities","saved","tombstones","prefs","inbox","sessions"]) assert.ok(data[key], key);
  assert.equal(data.sessions.length, 2);
  assert.equal((await write("/api/auth/logout", {all:true})).status, 200);
  assert.deepEqual(await (await read("/api/me", second)).json(), {user:null});
  assert.deepEqual(await (await read("/api/me")).json(), {user:null});
  const fresh = await signIn();
  assert.equal((await write("/api/me/delete", {confirm:"wrong"}, fresh)).status, 400);
  const deleted = await write("/api/me/delete", {confirm:"octocat"}, fresh);
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get("set-cookie")!, /Max-Age=0/);
  for (const table of ["users","identities","sessions","user_saved","saved_tombstones","alert_prefs","alert_state","alert_inbox","oauth_states","auth_rate"]) {
    const filter = table === "auth_rate" ? " WHERE bucket LIKE 'write:%' OR bucket LIKE 'danger:%'" : "";
    assert.equal(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}${filter}`).get()?.n, 0, table);
  }
  assert.deepEqual(await (await read("/api/me", fresh)).json(), {user:null});
});

test("all account design copy keys have Chinese and English text", () => {
  const keys = ["signIn","account","signOut","title","optional","benefit1","benefit2","github","passkey","privacy",
    "later","error","signedIn","rateLimited","mergeTitle","mergeBody","mergePrefs","mergeConfirm","mergeSkip","mergeOverflow",
    "syncHint","export","delete","deleteConfirm","deleted","signedOutKeep","channelSite","channelEmail","daily"] as const;
  for (const key of keys) {
    assert.match(accountCopy[key].zh, /[\u3400-\u9fff]/, key);
    assert.match(accountCopy[key].en, /[a-z]/i, key);
  }
});

test("new account writes reject missing CSRF and unauthenticated requests", async t => {
  const {get, write} = await loginFor(t);
  for (const path of ["/api/me/saved", "/api/me/saved/merge", "/api/me/prefs", "/api/me/delete"]) {
    assert.equal((await get(path, {method:"POST"})).status, 403);
    assert.equal((await write(path, {}, "")).status, 401);
  }
});

test("client renders an injected username literally and skipping import preserves local data without a write request", {timeout:1000}, async () => {
  const hostile = "<script>globalThis.executed = true</script>";
  let menuText = "";
  let finish!: () => void;
  const initialized = new Promise<void>(resolve => { finish = resolve; });
  const node = () => ({
    textContent: "", addEventListener() {}, append(..._children: unknown[]) {},
    replaceWith() {},
    set innerHTML(_value: string) { assert.fail("username must not enter HTML"); },
  });
  let skip!: () => void;
  const selectors: Record<string, unknown> = {
    "[data-account-slot]": node(),
    "#account-merge-dialog": {...node(), showModal:finish, close() {}},
    "[data-merge-skip]": {...node(), addEventListener(_event: string, listener: () => void) { skip = listener; }},
    "[data-merge-confirm]": node(),
    "[data-merge-explanation]": node(),
    "[data-merge-prefs]": node(),
    "[data-merge-status]": node(),
  };
  const storage = new Map([["dh-saved", '["local"]']]);
  const methods: string[] = [];
  const window = {};
  const context = {
    window, URLSearchParams, location:{search:""}, document:{
      querySelector(selector: string) { return selectors[selector] ?? null; },
      addEventListener() {},
      createElement(tag: string) {
        assert.notEqual(tag, "script");
        if (tag === "summary") {
          return {set textContent(value: string) { menuText = value; }};
        }
        return node();
      },
    },
    dhAccountOptions:{account:"/account", copy:{mergeBody:"{n} local, {m} missing", mergeConfirm:"Add {m}"}},
    fetch: async (path: string, init: RequestInit) => {
      methods.push(init.method ?? "GET");
      return Response.json(path === "/api/me" ? {user:{login:hostile}, prefs:{}, mergeKey:"test"} : {ids:["server"]});
    },
    localStorage:{getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value)},
    StorageEvent: class {}, dispatchEvent() {}, addEventListener() {},
  };
  runInNewContext(ACCOUNT_SCRIPT, context);
  await initialized;
  skip();
  assert.equal(menuText, "@" + hostile);
  assert.equal(Object.hasOwn(context, "executed"), false);
  assert.equal(storage.get("dh-saved"), '["local"]');
  assert.equal(storage.get("dh-merged:test"), "skipped");
  assert.deepEqual(methods, ["GET", "GET"]);
});

const DAY = 86_400_000;
const iso = (offset: number) => new Date(now + offset).toISOString();

function addAlertDeal(sqlite: DatabaseSync, id: string, firstSeen: string, deadline: string | null = null) {
  sqlite.prepare(`INSERT INTO deals (id,title,category,summary,value_tier,ends_at,source_name,source_id,source_url,last_verified_at,
    deal_type,status,rank_score,first_seen_at,updated_at) VALUES (?,?,'ai','No credit card required','money',?,'Mock','mock','https://example.test/feed',?,
    'trial','active',0,?,?)`).run(id, "Offer " + id, deadline, iso(0), firstSeen, iso(0));
}

function addAlertUser(sqlite: DatabaseSync, id: string, prefs: Record<string, unknown> = {category:"ai"}) {
  sqlite.prepare("INSERT INTO users VALUES (?,?,?,?)").run(id, id, iso(-DAY), iso(-DAY));
  sqlite.prepare("INSERT INTO alert_prefs VALUES (?,?,?)").run(id, JSON.stringify(prefs), iso(-DAY));
}

test("translation cron generates each alert kind once and respects alert preferences", async t => {
  const {sqlite, env} = setup(t, true);
  addAlertUser(sqlite, "enabled");
  addAlertUser(sqlite, "quiet", {category:"ai", newOffer:false, ending:false, changed:false});
  addAlertUser(sqlite, "site-off", {category:"ai", channels:{site:false}});
  addAlertUser(sqlite, "wrong-region", {category:"ai", region:"gb"});
  addAlertDeal(sqlite, "saved", iso(-2 * DAY), iso(5 * DAY));
  for (const id of ["enabled", "quiet", "site-off"]) {
    sqlite.prepare("INSERT INTO user_saved VALUES (?, 'saved', ?)").run(id, iso(-DAY));
    sqlite.prepare("INSERT INTO alert_state VALUES (?, 'saved', 'different-before')").run(id);
  }
  addAlertDeal(sqlite, "fresh", iso(-3600_000));
  const cron = {cron:TRANSLATE_CRON, scheduledTime:now} as ScheduledController;
  await worker.scheduled(cron, env);
  await worker.scheduled(cron, env);
  await worker.scheduled({...cron, scheduledTime:now + 7_200_000}, env);
  assert.deepEqual(sqlite.prepare("SELECT user_id || ':' || kind AS event FROM alert_inbox ORDER BY kind")
    .all().map(row => row.event), ["enabled:changed","enabled:ending","enabled:newOffer"]);
  assert.notEqual(sqlite.prepare("SELECT last_revision FROM alert_state WHERE user_id='quiet'").get()?.last_revision, "different-before");
});

test("alert scan processes a bounded rotating batch and keeps the untouched user's discovery watermark", async t => {
  const {sqlite, env} = setup(t, true);
  for (let i = 0; i <= ALERT_USER_BATCH; i++) addAlertUser(sqlite, "u" + i);
  addAlertDeal(sqlite, "new-for-everyone", iso(-60_000));
  assert.equal(await generateAccountAlerts(env.DB, new Date(now), 1000), ALERT_USER_BATCH);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM alert_scan_progress").get()?.n, ALERT_USER_BATCH);
  assert.equal(await generateAccountAlerts(env.DB, new Date(now)), 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM alert_inbox").get()?.n, ALERT_USER_BATCH + 1);
  assert.equal(await generateAccountAlerts(env.DB, new Date(now)), 0);
});

test("cleanup removes expired sessions, states, tombstones, inbox rows and rate windows only", async t => {
  const {sqlite, env} = setup(t, true);
  addAlertUser(sqlite, "u");
  for (const key of ["old", "fresh"]) {
    const old = key === "old";
    sqlite.prepare("INSERT INTO sessions(token_hash,user_id,created_at,rotated_at,expires_at) VALUES (?,'u',?,?,?)")
      .run(key, iso(-DAY), iso(-DAY), iso(old ? 0 : 6000));
    sqlite.prepare("INSERT INTO oauth_states VALUES (?,'mock','/',?,?)").run(key, iso(-6000), iso(old ? 0 : 6000));
    sqlite.prepare("INSERT INTO saved_tombstones VALUES ('u',?,?)").run(key, iso(old ? -31*DAY : -30*DAY));
    sqlite.prepare("INSERT INTO alert_inbox(user_id,dedupe_key,kind,deal_id,created_at,day) VALUES ('u',?,'ending',?,?,?)")
      .run(key, key, iso(old ? -91*DAY : -90*DAY), "2026-08-17");
    sqlite.prepare("INSERT INTO auth_rate VALUES (?,?,1)").run(key, iso(old ? -DAY-1 : -DAY));
  }
  sqlite.prepare("INSERT INTO sessions(token_hash,user_id,created_at,rotated_at,expires_at) VALUES ('absolute','u',?,?,?)")
    .run(iso(-180*DAY), iso(-DAY), iso(DAY));
  await cleanupAccountAlerts(env.DB, new Date(now));
  for (const [table, field] of [["sessions","token_hash"],["oauth_states","state_hash"],["saved_tombstones","deal_id"],
    ["alert_inbox","deal_id"],["auth_rate","bucket"]]) assert.equal(sqlite.prepare(`SELECT ${field} AS v FROM ${table}`).get()?.v, "fresh", table);
});

test("alert generation failure is isolated from the existing cron translation and collection results", async t => {
  const {sqlite, env, failScan} = setup(t, true);
  t.mock.method(globalThis, "fetch", async () => new Response("source unavailable in fixture", {status:503}));
  const consoleError = t.mock.method(console, "error", () => {});
  const consoleLog = t.mock.method(console, "log", () => {});
  const collection = {cron:RADAR_CRON, scheduledTime:now} as ScheduledController;
  const translation = {cron:TRANSLATE_CRON, scheduledTime:now} as ScheduledController;
  const off = {...env, ALERTS_SERVER_ENABLED:"0"};
  await worker.scheduled(collection, off);
  await worker.scheduled(translation, off);
  failScan();
  await worker.scheduled(translation, env);
  await worker.scheduled(collection, env);
  const runs = sqlite.prepare("SELECT ok,inserted_count,updated_count,archived_count,skipped_count,error FROM runs ORDER BY rowid").all();
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], runs[1]);
  const counts = sqlite.prepare("SELECT COUNT(*) AS n FROM source_checks GROUP BY run_id").all();
  assert.equal(counts.length, 2);
  assert.deepEqual(counts[0], counts[1]);
  const translate = consoleLog.mock.calls.map(call => String(call.arguments[0])).filter(s => s.includes('"message":"translate"'));
  assert.equal(translate.length, 2);
  assert.equal(translate[0], translate[1]);
  assert.equal(consoleError.mock.callCount(), 1);
  assert.deepEqual(consoleError.mock.calls[0]?.arguments, ["Deal Hunter account alert task failed", "generate"]);
});

test("inbox API scopes reads to the signed-in account, respects daily digest and validates CSRF", async t => {
  const {sqlite, read, write, get} = await loginFor(t, true);
  const user = sqlite.prepare("SELECT id FROM users").get()!.id as string;
  addAlertUser(sqlite, "other");
  addAlertDeal(sqlite, "example", iso(0));
  const insert = sqlite.prepare("INSERT INTO alert_inbox(user_id,dedupe_key,kind,deal_id,created_at,day) VALUES (?,?,'ending','example',?,?)");
  insert.run(user, "visible", iso(-DAY), "2026-11-14");
  insert.run(user, "future", iso(0), "2026-11-15");
  insert.run("other", "private", iso(-DAY), "2026-11-14");
  await write("/api/me/prefs", {frequency:"daily"});
  assert.equal((await get("/api/me/inbox")).status, 401);
  assert.equal((await get("/api/me/inbox/read", {method:"POST"})).status, 403);
  const inbox = await read("/api/me/inbox?lang=en");
  assert.match(inbox.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await inbox.json(), {
    entries:[{id:1,kind:"ending",dealId:"example",day:"2026-11-14",readAt:null,title:"Offer example"}],
    before:null,unread:1,daily:true,
  });
  assert.equal((await write("/api/me/inbox/read", {ids:[1,2,3]})).status, 200);
  assert.deepEqual(sqlite.prepare("SELECT read_at FROM alert_inbox ORDER BY id").all().map(row => row.read_at), [iso(0),null,null]);
  t.mock.timers.tick(17 * 3600_000 - 1);
  assert.equal((await (await read("/api/me/inbox")).json<{unread:number}>()).unread, 0);
  t.mock.timers.tick(1);
  assert.equal((await (await read("/api/me/inbox")).json<{unread:number}>()).unread, 1);
  sqlite.prepare("INSERT INTO alert_scan_progress VALUES (?,?)").run(user, iso(0));
  await write("/api/me/delete", {confirm:"octocat"});
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM alert_scan_progress").get()?.n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM alert_inbox").get()?.n, 1);
});

test("server inbox is unavailable when alerts are disabled for an otherwise signed-in account", async t => {
  const {read, write} = await loginFor(t);
  assert.equal((await read("/api/me/inbox")).status, 404);
  assert.equal((await write("/api/me/inbox/read", {through:1})).status, 404);
  const me = await (await read("/api/me")).json<{serverAlerts:boolean;unread:number}>();
  assert.equal(me.serverAlerts, false);
  assert.equal(me.unread, 0);
});
