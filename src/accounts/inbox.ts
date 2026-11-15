import { visibleAlertDay, type AlertKind } from "./alerts";
import { authJson } from "./security";

type InboxRow = {id: number; kind: AlertKind; deal_id: string; created_at: string; day: string;
  read_at: string | null; title: string | null; zh_title: string | null};
const visibleDay = (daily: boolean, now: number) => daily ? visibleAlertDay(now) : "9999-12-31";

export async function countUnread(db: D1Database, user: string, daily: boolean, now: number): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM alert_inbox WHERE user_id=? AND read_at IS NULL AND day<?")
    .bind(user, visibleDay(daily, now)).first<{n: number}>();
  return row?.n ?? 0;
}

function numericId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function listInbox(request: Request, db: D1Database, user: string, daily: boolean, now: number): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const cursor = query.get("before");
  const before = cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor);
  if (!numericId(before)) return authJson({error:"invalid_cursor"}, 400);
  const result = await db.prepare(`SELECT a.id, a.kind, a.deal_id, a.created_at, a.day, a.read_at, d.title, d.zh_title
    FROM alert_inbox AS a LEFT JOIN deals AS d ON d.id=a.deal_id
    WHERE a.user_id=? AND a.day<? AND a.id<? ORDER BY a.id DESC LIMIT 51`)
    .bind(user, visibleDay(daily, now), before).all<InboxRow>();
  const rows = result.results.slice(0, 50);
  return authJson({
    entries: rows.map(row => ({id:row.id, kind:row.kind, dealId:row.deal_id, day:row.day, readAt:row.read_at,
      title:query.get("lang") === "en" ? row.title : row.zh_title || row.title})),
    before: result.results.length > 50 ? rows.at(-1)?.id : null,
    unread: await countUnread(db, user, daily, now),
    daily,
  });
}

export async function markInboxRead(db: D1Database, user: string, daily: boolean, now: number, body: Record<string, unknown>): Promise<Response> {
  const {ids, through} = body;
  const byIds = Array.isArray(ids) && ids.length > 0 && ids.length <= 50 && ids.every(numericId);
  if (ids === undefined ? !numericId(through) : !byIds || through !== undefined) {
    return authJson({error:"invalid_body"}, 400);
  }
  await db.prepare(`UPDATE alert_inbox SET read_at=? WHERE user_id=? AND day<? AND read_at IS NULL
    AND ${byIds ? "id IN (SELECT value FROM json_each(?))" : "id<=?"}`)
    .bind(new Date(now).toISOString(), user, visibleDay(daily, now), byIds ? JSON.stringify(ids) : through as number).run();
  return authJson({ok:true, unread:await countUnread(db, user, daily, now)});
}
