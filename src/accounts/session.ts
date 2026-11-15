import { cookie, hash, randomToken, readCookie, SESSION, TOKEN_PATTERN } from "./security";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const SLIDING = 30 * DAY;
const ABSOLUTE = 180 * DAY;
const iso = (time: number) => new Date(time).toISOString();
export const clearSession = () => cookie(SESSION, "", 0);

type SessionRow = {token_hash: string; user_id: string; display_name: string; created_at: string; rotated_at: string; expires_at: string};

export async function createSession(db: D1Database, pepper: string, userId: string, now: number): Promise<string> {
  const token = randomToken();
  await db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,rotated_at,expires_at) VALUES (?,?,?,?,?)")
    .bind(await hash(pepper + token), userId, iso(now), iso(now), iso(now + SLIDING)).run();
  return cookie(SESSION, token, SLIDING / 1000);
}

export async function readSession(request: Request, db: D1Database, pepper: string, now: number, renew = true) {
  const token = readCookie(request, SESSION);
  if (token === undefined) return {row: null};
  if (!TOKEN_PATTERN.test(token)) return {row: null, setCookie: clearSession()};
  const currentHash = await hash(pepper + token);
  const row = await db.prepare(`SELECT sessions.token_hash, sessions.user_id, sessions.created_at,
    sessions.rotated_at, sessions.expires_at, users.display_name FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE (token_hash = ? OR (prev_hash = ? AND prev_valid_until > ?)) AND expires_at > ? AND sessions.created_at > ?
    LIMIT 1`).bind(currentHash, currentHash, iso(now), iso(now), iso(now - ABSOLUTE)).first<SessionRow>();
  if (!row) return {row: null, setCookie: clearSession()};
  if (!renew || currentHash !== row.token_hash) return {row};
  const expires = Math.min(now + SLIDING, Date.parse(row.created_at) + ABSOLUTE);
  if (now - Date.parse(row.rotated_at) >= 7 * DAY) {
    const next = randomToken();
    const updated = await db.prepare(`UPDATE sessions SET token_hash=?, prev_hash=?, prev_valid_until=?,
      rotated_at=?, expires_at=? WHERE token_hash=? RETURNING token_hash`)
      .bind(await hash(pepper + next), currentHash, iso(now + 60_000), iso(now), iso(expires), currentHash).first();
    return {row, setCookie: updated ? cookie(SESSION, next, Math.floor((expires - now) / 1000)) : undefined};
  }
  if (expires - Date.parse(row.expires_at) >= HOUR) {
    const updated = await db.prepare(`UPDATE sessions SET expires_at=? WHERE token_hash=? AND expires_at=?
      RETURNING token_hash`).bind(iso(expires), currentHash, row.expires_at).first();
    // A sliding refresh reuses the existing token. Suppress it near rotation so a
    // delayed response cannot normally overwrite the newly rotated cookie.
    if (updated && now - Date.parse(row.rotated_at) < 7 * DAY - HOUR) {
      return {row, setCookie: cookie(SESSION, token, Math.floor((expires - now) / 1000))};
    }
  }
  return {row};
}
