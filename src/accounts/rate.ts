import { hash } from "./security";

export async function allowRate(db: D1Database, bucket: string, now: number, limit: number, windowMs = 600_000): Promise<boolean> {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
  const row = await db.prepare(`INSERT INTO auth_rate(bucket,window_start,hits) VALUES (?,?,1)
    ON CONFLICT(bucket,window_start) DO UPDATE SET hits=hits+1 WHERE hits < ? RETURNING hits`)
    .bind(bucket, windowStart, limit + 1).first<{hits: number}>();
  return row !== null && row.hits <= limit;
}

export async function networkBucket(request: Request, pepper: string, kind: string): Promise<string> {
  return kind + ":" + await hash(pepper + ":" + (request.headers.get("cf-connecting-ip") ?? "unknown"));
}
