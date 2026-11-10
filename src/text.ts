const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/&#0*39;/gi, "'")
    .replace(/&#(\d+);/g, (_, num: string) => {
      const code = Number(num);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    });
}

export function stripTags(value: string): string {
  const withText = decodeEntities(value);
  const withoutBlocks = withText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  return withoutBlocks.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function pageText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1] ?? "") : "";
  const meta =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ??
    "";
  const visible = stripTags(html).replace(/\\n/g, " ").slice(0, 80_000);
  const text = collapse(`${decodeEntities(meta)} ${title} ${visible}`).slice(0, 80_000);
  return { title: title.slice(0, 240), text };
}

export function looksLikeChallenge(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status === 503) return true;
  const head = body.slice(0, 2500).toLowerCase();
  return (
    head.includes("just a moment") ||
    head.includes("attention required") ||
    head.includes("cf-browser-verification") ||
    head.includes("enable javascript and cookies")
  );
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
