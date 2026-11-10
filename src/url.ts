const TRACKING_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "ref",
  "ref_src",
  "ref_url",
  "referrer",
  "referral",
  "invite",
  "invite_code",
  "invitation",
  "aff",
  "affiliate",
  "aff_id",
  "partner",
  "partner_id",
  "clickid",
  "irclickid",
  "ranmid",
  "raneaid",
  "ransiteid",
  "igshid",
  "si",
  "share",
  "icid",
]);

const AFFILIATE_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "sjv.io",
  "anrdoezrs.net",
  "tkqlhce.com",
  "dpbolvw.net",
  "shareasale.com",
  "impact.com",
  "pntrs.com",
  "pjtra.com",
  "pntrac.com",
  "go.skimresources.com",
  "click.linksynergy.com",
  "linksynergy.com",
  "avantlink.com",
  "awin1.com",
  "rstyle.me",
  "amzn.to",
  "geni.us",
];

function hostBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return AFFILIATE_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
}

function pathBlocked(pathname: string): boolean {
  return /\/(invite|invitation|referral|affiliate)(\/|$)/i.test(pathname);
}

/** Canonical https URL with tracking and invite parameters removed. Empty when the link is not kept. */
export function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (hostBlocked(url.hostname) || pathBlocked(url.pathname)) return "";
  if (url.username || url.password) return "";

  const kept = new URLSearchParams();
  const keys = [...url.searchParams.keys()].sort();
  for (const key of keys) {
    if (TRACKING_KEYS.has(key.toLowerCase())) continue;
    if (url.hostname.includes("amazon.") && key.toLowerCase() === "tag") continue;
    for (const value of url.searchParams.getAll(key)) kept.append(key, value);
  }
  url.search = kept.toString() ? `?${kept.toString()}` : "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function fingerprint(parts: string[]): Promise<string> {
  return sha256Hex(parts.join("\n"));
}
