import { allowsAccountWrite } from "./csrf";
import { failedGitHub, finishGitHub, startGitHub, type GitHubConfig } from "./github";
import { allowRate } from "./rate";
import { authJson } from "./security";
import { clearSession, readSession } from "./session";

type AccountVars = {
  ACCOUNTS_ENABLED?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_PEPPER?: string;
};

export function accountsEnabled(env: Env): boolean {
  return (env as Env & AccountVars).ACCOUNTS_ENABLED === "1";
}

export async function accountApi(request: Request, env: Env, path: string): Promise<Response> {
  if (!accountsEnabled(env)) return authJson(path === "/api/me" ? {user: null, accounts: false} : {error: "not_found"}, 404);
  const vars: AccountVars = env as Env & AccountVars;
  const now = Date.now();
  const pepper = vars.SESSION_PEPPER;
  try {
    if (path === "/api/me") {
      if (request.method !== "GET") return authJson({error: "method_not_allowed"}, 405);
      const session = pepper ? await readSession(request, env.DB, pepper, now) : {row: null};
      return authJson({user: session.row ? {login: session.row.display_name} : null}, 200, session.setCookie);
    }
    if (path === "/api/auth/logout") {
      if (request.method !== "POST") return authJson({error: "method_not_allowed"}, 405);
      if (!allowsAccountWrite(request)) return authJson({error: "forbidden"}, 403);
      const session = pepper ? await readSession(request, env.DB, pepper, now, false) : {row: null};
      if (session.row) {
        if (!(await allowRate(env.DB, "write:" + session.row.user_id, now, 120))) return authJson({error: "rate_limited"}, 429);
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return authJson({error: "invalid_body"}, 400);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash=? OR prev_hash=?")
          .bind(session.row.token_hash, session.row.token_hash).run();
      }
      return authJson({ok: true}, 200, clearSession());
    }
    const callback = path === "/api/auth/github/callback";
    if (!callback && path !== "/api/auth/github/start") return authJson({error: "not_found"}, 404);
    if (request.method !== "GET") return authJson({error: "method_not_allowed"}, 405);
    if (!pepper || !vars.GITHUB_CLIENT_ID || !vars.GITHUB_CLIENT_SECRET) return failedGitHub(request);
    const config: GitHubConfig = {clientId: vars.GITHUB_CLIENT_ID, clientSecret: vars.GITHUB_CLIENT_SECRET, pepper};
    return await (callback ? finishGitHub : startGitHub)(request, env.DB, config, now);
  } catch {
    console.error("Deal Hunter account request failed");
    return path.startsWith("/api/auth/github/") ? failedGitHub(request) : authJson({error: "unavailable"}, 503);
  }
}
