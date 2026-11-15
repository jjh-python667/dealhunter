export const SESSION = "__Host-dh_session";
export const OAUTH = "__Host-dh_oauth";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function randomToken(length = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(length)));
}

export async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hash(value: string): Promise<string> {
  return Array.from(await digest(value), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function readCookie(request: Request, name: string): string | undefined {
  const prefix = name + "=";
  return request.headers.get("cookie")?.split(";").map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length);
}

export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function authHeaders(): Headers {
  return new Headers({"cache-control": "no-store, private", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff"});
}

export function authJson(body: unknown, status = 200, setCookie?: string): Response {
  const headers = authHeaders();
  if (setCookie) headers.append("set-cookie", setCookie);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {headers, status});
}
