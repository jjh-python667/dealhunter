import { allowRate, networkBucket } from "./rate";
import { createSession } from "./session";
import { authHeaders, authJson, base64url, cookie, digest, hash, OAUTH, randomToken, readCookie, TOKEN_PATTERN } from "./security";
import { accountCopy } from "./copy";

export type GitHubConfig = {clientId: string; clientSecret: string; pepper: string};
const CALLBACK = "/api/auth/github/callback";
const TIMEOUT = 10_000;
// Workers rejects redirect "error" with TypeError. "manual" still leaves 3xx as !ok.
const REDIRECT = "manual" as const;
const OWN_REASON = /^(?:token_http_[0-9]{1,3}|user_http_[0-9]{1,3}|token_missing|token_rejected|user_invalid)$/;
const GITHUB_ERROR = /^[a-z][a-z0-9]*(_[a-z0-9]+){1,6}$/;
const EXCEPTION_NAME = /^[A-Z][A-Za-z0-9]{1,40}$/;
const clearOAuth = () => cookie(OAUTH, "", 0);

function logGitHubLoginFailure(reason: string): void {
  const safe = reason.length <= 64 && (OWN_REASON.test(reason) || GITHUB_ERROR.test(reason) || EXCEPTION_NAME.test(reason));
  console.error("Deal Hunter GitHub login failed", safe ? reason : "unrecognized");
}

export function logGitHubLoginException(error: unknown): void {
  const name = error instanceof Error ? error.name : "";
  logGitHubLoginFailure(EXCEPTION_NAME.test(name) ? name : "Error");
}

function httpReason(stage: "token" | "user", status: number): string {
  return Number.isInteger(status) && status >= 0 && status <= 999 ? `${stage}_http_${status}` : stage === "token" ? "token_rejected" : "user_invalid";
}

function classifyOAuthError(error: unknown): string | null {
  if (typeof error !== "string" || !error) return null;
  return error.length <= 64 && GITHUB_ERROR.test(error) ? error : "token_rejected";
}

function returnPath(raw: string | null, origin: string): string {
  if (!raw || raw.length > 2048 || !raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(raw)) return "/";
  const url = new URL(raw, origin);
  if (url.origin !== origin || url.pathname.startsWith("//") || url.pathname.startsWith("/api/")) return "/";
  return url.pathname + url.search + url.hash;
}

function redirect(location: string, ...cookies: string[]): Response {
  const headers = authHeaders();
  headers.set("location", location);
  for (const value of cookies) headers.append("set-cookie", value);
  return new Response(null, {status: 302, headers});
}

export async function startGitHub(request: Request, db: D1Database, config: GitHubConfig, now: number): Promise<Response> {
  const url = new URL(request.url);
  if (!(await allowRate(db, await networkBucket(request, config.pepper, "login"), now, 10))) {
    const result = authJson({error: "rate_limited", message: accountCopy.rateLimited[url.searchParams.get("lang") === "en" ? "en" : "zh"]}, 429);
    result.headers.set("retry-after", "600");
    return result;
  }
  const state = randomToken();
  const verifier = randomToken();
  await db.prepare("INSERT INTO oauth_states(state_hash,code_verifier,return_to,created_at,expires_at) VALUES (?,?,?,?,?)")
    .bind(await hash(state), verifier, returnPath(url.searchParams.get("return"), url.origin),
      new Date(now).toISOString(), new Date(now + 600_000).toISOString()).run();
  const target = new URL("https://github.com/login/oauth/authorize");
  target.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: url.origin + CALLBACK, state,
    code_challenge: base64url(await digest(verifier)), code_challenge_method: "S256", allow_signup: "true",
  }).toString();
  return redirect(target.href, cookie(OAUTH, state, 600));
}

export function failedGitHub(request: Request): Response {
  return redirect("/account?login=error", ...(readCookie(request, OAUTH) ? [clearOAuth()] : []));
}

async function tokenFailure(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && "error" in payload) {
      return classifyOAuthError((payload as {error: unknown}).error) ?? httpReason("token", response.status);
    }
  } catch { /* A non-JSON body still has a safe status code. */ }
  return httpReason("token", response.status);
}

async function githubIdentity(config: GitHubConfig, code: string, verifier: string, origin: string) {
  try {
    const token = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", redirect: REDIRECT, signal: AbortSignal.timeout(TIMEOUT),
      headers: {accept: "application/json"},
      body: new URLSearchParams({client_id: config.clientId, client_secret: config.clientSecret,
        code, code_verifier: verifier, redirect_uri: origin + CALLBACK}),
    });
    if (!token.ok) {
      logGitHubLoginFailure(await tokenFailure(token));
      return null;
    }
    const payload: unknown = await token.json();
    const record = payload && typeof payload === "object" ? payload as {access_token?: unknown; error?: unknown} : null;
    const oauthError = classifyOAuthError(record?.error);
    if (oauthError) {
      logGitHubLoginFailure(oauthError);
      return null;
    }
    const accessToken = record?.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      logGitHubLoginFailure("token_missing");
      return null;
    }
    const response = await fetch("https://api.github.com/user", {
      redirect: REDIRECT, signal: AbortSignal.timeout(TIMEOUT),
      headers: {authorization: "Bearer " + accessToken, accept: "application/vnd.github+json", "user-agent": "Deal-Hunter"},
    });
    if (!response.ok) {
      logGitHubLoginFailure(httpReason("user", response.status));
      return null;
    }
    const {id, login} = await response.json<{id?: unknown; login?: unknown}>();
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0 ||
        typeof login !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(login)) {
      logGitHubLoginFailure("user_invalid");
      return null;
    }
    return {subject: String(id), login};
  } catch (error) {
    logGitHubLoginException(error);
    return null;
  }
}

async function upsertIdentity(db: D1Database, subject: string, login: string, now: number): Promise<string> {
  const id = randomToken(16);
  const timestamp = new Date(now).toISOString();
  // D1 executes the batch as a transaction, including the first-sign-in test.
  const [, , updated] = await db.batch<{id: string}>([
    db.prepare(`INSERT INTO users(id, display_name, created_at, last_seen_at)
      SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM identities WHERE provider='github' AND subject=?)`)
      .bind(id, login, timestamp, timestamp, subject),
    db.prepare(`INSERT INTO identities(provider, subject, user_id, created_at)
      SELECT 'github', ?, id, ? FROM users WHERE id=?`).bind(subject, timestamp, id),
    db.prepare(`UPDATE users SET display_name=?, last_seen_at=?
      WHERE id=(SELECT user_id FROM identities WHERE provider='github' AND subject=?) RETURNING id`)
      .bind(login, timestamp, subject),
  ]);
  const userId = updated?.results[0]?.id;
  if (!userId) throw new Error("identity_upsert_failed");
  return userId;
}

export async function finishGitHub(request: Request, db: D1Database, config: GitHubConfig, now: number): Promise<Response> {
  const url = new URL(request.url);
  if (!(await allowRate(db, await networkBucket(request, config.pepper, "callback"), now, 20))) return failedGitHub(request);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !TOKEN_PATTERN.test(state) || state !== readCookie(request, OAUTH)) return failedGitHub(request);
  const flow = await db.prepare("DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING code_verifier, return_to")
    .bind(await hash(state), new Date(now).toISOString()).first<{code_verifier: string; return_to: string}>();
  if (!flow || !code || code.length > 1024) return failedGitHub(request);
  const identity = await githubIdentity(config, code, flow.code_verifier, url.origin);
  if (!identity) return failedGitHub(request);
  const session = await createSession(db, config.pepper, await upsertIdentity(db, identity.subject, identity.login, now), now);
  const next = new URL(returnPath(flow.return_to, url.origin), url.origin);
  next.searchParams.set("login", "ok");
  return redirect(next.pathname + next.search + next.hash, clearOAuth(), session);
}
