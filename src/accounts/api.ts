import { allowsAccountWrite } from "./csrf";
import { deleteAccount, exportAccount, getPrefs, listSaved, MAX_SAVED, mergeSaved, parsePrefs, putPrefs, readAccountBody, updateSaved } from "./data";
import { failedGitHub, finishGitHub, startGitHub, type GitHubConfig } from "./github";
import { allowRate } from "./rate";
import { authHeaders, authJson, hash } from "./security";
import { clearSession, readSession } from "./session";

type AccountVars = {
  ACCOUNTS_ENABLED?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_PEPPER?: string;
};

const ME_METHODS: Record<string, string[]> = {
  "/api/me/saved": ["GET", "POST"],
  "/api/me/saved/merge": ["POST"],
  "/api/me/prefs": ["GET", "POST"],
  "/api/me/export": ["GET"],
  "/api/me/delete": ["POST"],
};

async function accountData(request: Request, db: D1Database, path: string, pepper: string | undefined, now: number) {
  const write = request.method === "POST";
  if (!ME_METHODS[path]?.includes(request.method)) return authJson({error: "method_not_allowed"}, 405);
  if (write && !allowsAccountWrite(request)) return authJson({error: "forbidden"}, 403);
  const session = pepper ? await readSession(request, db, pepper, now, false) : {row: null};
  if (!session.row) return authJson({error: "unauthenticated"}, 401, session.setCookie);
  const user = session.row.user_id;
  const danger = path.endsWith("/export") || path.endsWith("/delete");
  if (write || danger) {
    if (!(await allowRate(db, (danger ? "danger:" : "write:") + user, now, danger ? 5 : 120, danger ? 3600_000 : 600_000))) {
      return authJson({error: "rate_limited"}, 429);
    }
  }
  if (!write) {
    if (path === "/api/me/saved") return authJson({ids: await listSaved(db, user)});
    if (path === "/api/me/prefs") return authJson({prefs: await getPrefs(db, user)});
    const headers = authHeaders();
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("content-disposition", 'attachment; filename="dealhunter-export.json"');
    return new Response(JSON.stringify(await exportAccount(db, user)), {headers});
  }
  const body = await readAccountBody(request);
  if (!body) return authJson({error: "invalid_body"}, 400);
  const at = new Date(now).toISOString();
  if (path === "/api/me/delete") {
    if (body.confirm !== session.row.display_name) return authJson({error: "invalid_confirmation"}, 400);
    await deleteAccount(db, user);
    return authJson({ok: true}, 200, clearSession());
  }
  if (path === "/api/me/prefs") {
    const prefs = parsePrefs(body);
    if (!prefs) return authJson({error: "invalid_preferences"}, 400);
    await putPrefs(db, user, at, prefs);
    return authJson({prefs});
  }
  if (path === "/api/me/saved/merge") {
    const prefs = body.prefs === undefined ? undefined : parsePrefs(body.prefs);
    if (!Array.isArray(body.ids) || body.ids.length > MAX_SAVED || (body.prefs !== undefined && !prefs)) {
      return authJson({error: "invalid_body"}, 400);
    }
    return authJson(await mergeSaved(db, user, at, body.ids, prefs));
  }
  const {add = [], remove = []} = body;
  if (!Array.isArray(add) || !Array.isArray(remove) || add.length + remove.length > MAX_SAVED) {
    return authJson({error: "invalid_body"}, 400);
  }
  return authJson(await updateSaved(db, user, at, add, remove));
}

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
      if (!session.row) return authJson({user: null}, 200, session.setCookie);
      const id = session.row.user_id;
      const [count, prefs] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS n FROM user_saved WHERE user_id=?").bind(id).first<{n: number}>(),
        getPrefs(env.DB, id),
      ]);
      return authJson({user: {login: session.row.display_name}, savedCount: count?.n ?? 0, prefs, unread: 0,
        mergeKey: await hash(pepper + ":browser:" + id)}, 200, session.setCookie);
    }
    if (Object.hasOwn(ME_METHODS, path)) return await accountData(request, env.DB, path, pepper, now);
    if (path === "/api/auth/logout") {
      if (request.method !== "POST") return authJson({error: "method_not_allowed"}, 405);
      if (!allowsAccountWrite(request)) return authJson({error: "forbidden"}, 403);
      const session = pepper ? await readSession(request, env.DB, pepper, now, false) : {row: null};
      if (session.row) {
        if (!(await allowRate(env.DB, "write:" + session.row.user_id, now, 120))) return authJson({error: "rate_limited"}, 429);
        const body = await readAccountBody(request);
        if (!body || (body.all !== undefined && typeof body.all !== "boolean")) return authJson({error: "invalid_body"}, 400);
        if (body.all) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(session.row.user_id).run();
        else await env.DB.prepare("DELETE FROM sessions WHERE token_hash=? OR prev_hash=?")
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
