import { escapeHtml } from "../text";
import type { SiteLang } from "./document";

/** Canonical URL with no tracking query and no `lang` parameter. */
export function canonicalUrl(origin: string | undefined, path: string): string {
  const base = (origin ?? "").trim().replace(/\/+$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

function jsonLdScript(data: Record<string, unknown>): string {
  const json = JSON.stringify(data).replace(/[&<>]/g, (char) => {
    if (char === "&") return "\\u0026";
    if (char === "<") return "\\u003c";
    return "\\u003e";
  });
  return `<script type="application/ld+json">${json}</script>`;
}

/**
 * Shared document head for the homepage, channel pages, the full list, and deal
 * pages. Canonical URLs omit `?lang=`; the other language is an hreflang alternate.
 * No og:image: there is no first-party raster, and CSP keeps remote images off.
 */
export function seoHead(input: {
  lang: SiteLang;
  title: string;
  description: string;
  path: string;
  origin?: string;
  type: "website" | "article";
  jsonLd?: Record<string, unknown> | null;
}): string {
  const canonical = canonicalUrl(input.origin, input.path);
  const english = `${canonical}${canonical.includes("?") ? "&" : "?"}lang=en`;
  const locale = input.lang === "en" ? "en_US" : "zh_CN";
  const alternateLocale = input.lang === "en" ? "zh_CN" : "en_US";
  const tags = [
    `<meta name="description" content="${escapeHtml(input.description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<link rel="alternate" hreflang="zh-CN" href="${escapeHtml(canonical)}">`,
    `<link rel="alternate" hreflang="en" href="${escapeHtml(english)}">`,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="${input.type}">`,
    `<meta property="og:title" content="${escapeHtml(input.title)}">`,
    `<meta property="og:description" content="${escapeHtml(input.description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:site_name" content="GLOBAL DEAL HUNTER">`,
    `<meta property="og:locale" content="${locale}">`,
    `<meta property="og:locale:alternate" content="${alternateLocale}">`,
    `<meta name="twitter:card" content="summary">`,
    `<link rel="icon" href="/favicon.svg">`,
  ];
  if (input.jsonLd) tags.push(jsonLdScript(input.jsonLd));
  return tags.join("");
}
