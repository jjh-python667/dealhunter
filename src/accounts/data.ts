import { REGIONS } from "../content/evidence";
import { CATEGORIES } from "../labels";

export const MAX_SAVED = 1000;
export const DEFAULT_PREFS = {
  region: "", category: "", noCard: false, noRenewal: false, newOffer: true, ending: true,
  changed: true, frequency: "live", channels: {site: true, email: false, push: false},
};

export function objectBody(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readAccountBody(request: Request): Promise<Record<string, unknown> | undefined> {
  const reader = request.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 400_000) {
        await reader.cancel();
        return;
      }
      text += decoder.decode(value, {stream:true});
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    return objectBody(body) ? body : undefined;
  } catch {
    return;
  } finally {
    reader.releaseLock();
  }
}

export function parsePrefs(value: unknown) {
  if (!objectBody(value)) return;
  const output = {...DEFAULT_PREFS, channels: {...DEFAULT_PREFS.channels}};
  if (value.region !== undefined) {
    if (typeof value.region !== "string" || (value.region !== "" && !Object.hasOwn(REGIONS, value.region))) return;
    output.region = value.region;
  }
  if (value.category !== undefined) {
    if (typeof value.category !== "string" || (value.category !== "" && !(CATEGORIES as readonly string[]).includes(value.category))) return;
    output.category = value.category;
  }
  for (const key of ["noCard", "noRenewal", "newOffer", "ending", "changed"] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "boolean") return;
    output[key] = value[key];
  }
  if (value.frequency !== undefined) {
    if (value.frequency !== "live" && value.frequency !== "daily") return;
    output.frequency = value.frequency;
  }
  if (value.channels !== undefined) {
    if (!objectBody(value.channels) || value.channels.email === true || value.channels.push === true ||
        (value.channels.site !== undefined && typeof value.channels.site !== "boolean")) return;
    output.channels.site = value.channels.site !== false;
  }
  return output;
}

function ids(value: unknown[]): string[] {
  return [...new Set(value.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/.test(id)))];
}

export async function listSaved(db: D1Database, user: string): Promise<string[]> {
  return (await db.prepare(`SELECT deal_id FROM user_saved WHERE user_id=? ORDER BY saved_at, deal_id`)
    .bind(user).all<{deal_id: string}>()).results.map(row => row.deal_id);
}

export async function getPrefs(db: D1Database, user: string) {
  const row = await db.prepare("SELECT prefs_json FROM alert_prefs WHERE user_id=?").bind(user).first<{prefs_json: string}>();
  return row ? parsePrefs(JSON.parse(row.prefs_json)) ?? DEFAULT_PREFS : DEFAULT_PREFS;
}

function prefsWrite(db: D1Database, user: string, now: string, prefs: typeof DEFAULT_PREFS) {
  return db.prepare(`INSERT INTO alert_prefs(user_id,prefs_json,updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET prefs_json=excluded.prefs_json, updated_at=excluded.updated_at`)
    .bind(user, JSON.stringify(prefs), now);
}

export const putPrefs = (db: D1Database, user: string, now: string, prefs: typeof DEFAULT_PREFS) =>
  prefsWrite(db, user, now, prefs).run();

const SAVED = "SELECT deal_id FROM user_saved WHERE user_id=? ORDER BY saved_at, deal_id";
const ELIGIBLE = `SELECT input.value AS id, input.key AS position FROM json_each(?1) AS input
  WHERE NOT EXISTS (SELECT 1 FROM user_saved WHERE user_id=?2 AND deal_id=input.value)`;
const NO_TOMBSTONE = " AND NOT EXISTS (SELECT 1 FROM saved_tombstones WHERE user_id=?2 AND deal_id=input.value)";
const ROOM = `MAX(0, ${MAX_SAVED} - (SELECT COUNT(*) FROM user_saved WHERE user_id=?2))`;

export async function updateSaved(db: D1Database, user: string, now: string, add: unknown[], remove: unknown[]) {
  const toRemove = ids(remove);
  const removeSet = new Set(toRemove);
  const toAdd = ids(add).filter(id => !removeSet.has(id));
  const [, , , inserted, , saved] = await db.batch<{deal_id: string}>([
    db.prepare("DELETE FROM user_saved WHERE user_id=? AND deal_id IN (SELECT value FROM json_each(?))").bind(user, JSON.stringify(toRemove)),
    db.prepare("DELETE FROM alert_state WHERE user_id=? AND deal_id IN (SELECT value FROM json_each(?))").bind(user, JSON.stringify(toRemove)),
    db.prepare(`INSERT INTO saved_tombstones(user_id,deal_id,removed_at) SELECT ?,value,? FROM json_each(?) WHERE 1
      ON CONFLICT(user_id,deal_id) DO UPDATE SET removed_at=excluded.removed_at`).bind(user, now, JSON.stringify(toRemove)),
    db.prepare(`INSERT INTO user_saved(user_id,deal_id,saved_at)
      SELECT ?2,id,?3 FROM (${ELIGIBLE}) ORDER BY position LIMIT ${ROOM} RETURNING deal_id`).bind(JSON.stringify(toAdd), user, now),
    // Explicit user saves may revive a removed deal. An import never does.
    db.prepare(`DELETE FROM saved_tombstones WHERE user_id=? AND deal_id IN (SELECT value FROM json_each(?))
      AND deal_id IN (SELECT deal_id FROM user_saved WHERE user_id=?)`).bind(user, JSON.stringify(toAdd), user),
    db.prepare(SAVED).bind(user),
  ]);
  return {ids: saved!.results.map(row => row.deal_id), added: inserted!.results.length};
}

export async function mergeSaved(db: D1Database, user: string, now: string, input: unknown[], prefs?: typeof DEFAULT_PREFS) {
  const eligible = ELIGIBLE + NO_TOMBSTONE;
  const json = JSON.stringify(ids(input));
  const [stats, inserted, saved] = await db.batch<{candidates?: number; deal_id?: string}>([
    db.prepare(`SELECT COUNT(*) AS candidates FROM (${eligible})`).bind(json, user),
    db.prepare(`INSERT INTO user_saved(user_id,deal_id,saved_at)
      SELECT ?2,id,?3 FROM (${eligible}) ORDER BY position LIMIT ${ROOM} RETURNING deal_id`).bind(json, user, now),
    db.prepare(SAVED).bind(user),
    ...(prefs ? [prefsWrite(db, user, now, prefs)] : []),
  ]);
  const added = inserted!.results.length;
  const overflow = Number(stats!.results[0]?.candidates) - added;
  return {ids: saved!.results.map(row => String(row.deal_id)), added, skipped: input.length - added - overflow, overflow,
    ...(prefs ? {prefs} : {})};
}

export async function exportAccount(db: D1Database, user: string) {
  const [profile, identities, saved, tombstones, settings, inbox, sessions] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT display_name AS login, created_at, last_seen_at FROM users WHERE id=?").bind(user),
    db.prepare("SELECT provider, subject, created_at FROM identities WHERE user_id=? AND provider='github'").bind(user),
    db.prepare("SELECT deal_id, saved_at FROM user_saved WHERE user_id=? ORDER BY saved_at, deal_id").bind(user),
    db.prepare("SELECT deal_id, removed_at FROM saved_tombstones WHERE user_id=? ORDER BY removed_at, deal_id").bind(user),
    db.prepare("SELECT prefs_json FROM alert_prefs WHERE user_id=?").bind(user),
    db.prepare("SELECT kind, deal_id, created_at, day, read_at FROM alert_inbox WHERE user_id=? ORDER BY id").bind(user),
    db.prepare("SELECT created_at, expires_at FROM sessions WHERE user_id=? ORDER BY created_at").bind(user),
  ]).then(results => results.map(result => result.results));
  const prefsJson = settings?.[0]?.prefs_json;
  const prefs = typeof prefsJson === "string" ? parsePrefs(JSON.parse(prefsJson)) ?? DEFAULT_PREFS : DEFAULT_PREFS;
  return {user:profile?.[0] ?? null, identities, saved, tombstones, prefs, inbox, sessions};
}

export async function deleteAccount(db: D1Database, user: string) {
  await db.batch([
    ...["alert_inbox", "alert_state", "alert_prefs", "saved_tombstones", "user_saved", "sessions", "identities"]
      .map(table => db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(user)),
    db.prepare("DELETE FROM auth_rate WHERE bucket IN (?,?)").bind("write:" + user, "danger:" + user),
    db.prepare("DELETE FROM users WHERE id=?").bind(user),
  ]);
}
