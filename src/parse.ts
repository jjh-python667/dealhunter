import { excerptAroundDeal } from "./extract";
import { stripTags } from "./text";

export type FeedItem = {
  title: string;
  link: string;
  publishedAt: string | null;
  description: string;
  raw: string;
};

function tagText(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
    if (match?.[1]) return stripTags(match[1]);
  }
  return "";
}

function pickLink(block: string): string {
  const tags = [...block.matchAll(/<link\b([^>]*)>([\s\S]*?)<\/link>|<link\b([^>]*)\/?>/gi)];
  const candidates: Array<{ href: string; rel: string }> = [];
  for (const tag of tags) {
    const attrs = `${tag[1] ?? ""} ${tag[3] ?? ""}`;
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? stripTags(tag[2] ?? "");
    if (!href) continue;
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] ?? "";
    candidates.push({ href, rel: rel.toLowerCase() });
  }
  const alternate = candidates.find((item) => item.rel.includes("alternate") && !item.rel.includes("self"));
  const plain = candidates.find((item) => !item.rel.includes("self"));
  return (alternate ?? plain ?? candidates[0])?.href ?? "";
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  return date.toISOString();
}

export function parseFeed(xml: string): FeedItem[] {
  const tag = /<entry\b/i.test(xml) && !/<item\b/i.test(xml) ? "entry" : "item";
  const starts = [...xml.matchAll(new RegExp(`<${tag}\\b`, "gi"))].flatMap((match) => (match.index === undefined ? [] : [match.index]));
  const items: FeedItem[] = [];
  for (let index = 0; index < starts.length && items.length < 15; index += 1) {
    const start = starts[index]!;
    const next = starts[index + 1] ?? xml.length;
    const block = xml.slice(start, Math.min(next, start + 12_000));
    const title = tagText(block, ["title"]);
    if (!title) continue;
    const description = tagText(block, ["description", "summary", "content:encoded", "content"]);
    items.push({
      title: title.slice(0, 240),
      link: pickLink(block),
      publishedAt: parseDate(tagText(block, ["pubDate", "published", "updated", "dc:date"])),
      description: description.slice(0, 1200),
      raw: block,
    });
  }
  return items;
}

export function dealExcerptFromItem(item: FeedItem): string | null {
  return excerptAroundDeal(item.title, item.description.slice(0, 700));
}
