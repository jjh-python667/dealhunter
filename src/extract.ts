import type { Category, DealType, ValueTier } from "./labels";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DEAL_PATTERNS: RegExp[] = [
  /\bfree\s+for\s+everyone\b/i,
  /\bfree\s+for\s+a\s+limited\s+time\b/i,
  /\bfreely\s+available\b/i,
  /\bat\s+no\s+cost\b/i,
  /\bno\s+charge\b/i,
  /\bno\s+monthly\s+fees\b/i,
  /\bno[- ]fees?\b/i,
  /\bfree\s+trial\b/i,
  /\bfree\s+tier\b/i,
  /\bfree\s+plan\b/i,
  /\bfor\s+free\b/i,
  /\b\d+(?:\.\d+)?\s*%\s*off\b/i,
  /\bhalf\s+the\s+commission\b/i,
  /\b(?:fee|fees)\s+waived\b/i,
  /\bcashback\b/i,
  /\bairdrop\b/i,
  /\bwelcome\s+bonus\b/i,
  /\bdeposit\s+bonus\b/i,
  /\bpromo\s+code\b/i,
  /\bcoupon\b/i,
  /免费|限时免费|空投|返现|免手续费|优惠券/,
];

export function isDealText(text: string): boolean {
  const cleaned = text.replace(/https?:\/\/\S+/gi, " ");
  return DEAL_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export function excerptAroundDeal(title: string, description: string): string | null {
  const blob = `${title}. ${description}`.replace(/\s+/g, " ").trim().slice(0, 900);
  if (!isDealText(`${title}. ${description.slice(0, 700)}`)) return null;
  const cleaned = blob.replace(/https?:\/\/\S+/gi, " ");
  let index = -1;
  for (const pattern of DEAL_PATTERNS) {
    const match = pattern.exec(cleaned);
    if (match && (index === -1 || match.index < index)) index = match.index;
  }
  if (index < 0) return null;
  let start = Math.max(0, index - 160);
  let end = Math.min(cleaned.length, index + 260);
  const left = cleaned.lastIndexOf(". ", index);
  if (left >= 0 && left >= index - 180) start = left + 2;
  const right = cleaned.indexOf(". ", index);
  if (right !== -1 && right <= index + 280) end = right + 1;
  return cleaned.slice(start, end).trim();
}

type FoundDate = { iso: string; index: number; raw: string };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDay(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const patterns: Array<{ re: RegExp; read: (match: RegExpExecArray) => string | null }> = [
    {
      re: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
      read: (match) => isoDay(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      re: /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
      read: (match) => isoDay(Number(match[1]), Number(match[2]), Number(match[3])),
    },
    {
      re: /\b([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/g,
      read: (match) => {
        const month = MONTHS[match[1]!.toLowerCase()];
        return month ? isoDay(Number(match[3]), month, Number(match[2])) : null;
      },
    },
    {
      re: /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/g,
      read: (match) => {
        const month = MONTHS[match[2]!.toLowerCase()];
        return month ? isoDay(Number(match[3]), month, Number(match[1])) : null;
      },
    },
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.re)) {
      const iso = pattern.read(match);
      if (!iso || match.index === undefined) continue;
      found.push({ iso, index: match.index, raw: match[0] });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function cueBefore(text: string, index: number): "start" | "end" | null {
  const window = text.slice(Math.max(0, index - 60), index).toLowerCase();
  if (/截止|截至|有效期至|结束|until|through|before|expires|expiry|deadline|ends|ending|valid until|valid through/.test(window)) {
    return "end";
  }
  if (/开始|自|starts|starting|begins|from/.test(window)) return "start";
  return null;
}

const DURATION =
  /over\s+\d+\s+days|\b\d+\s*-day\b|\bfor\s+\d+\s+years?\b|\bfor\s+12\s+months\b|\bfor\s+a\s+limited\s+time\b|\b30-day\b|\b90-day\b/i;

export type TimeExtraction = { startsAt: string | null; endsAt: string | null; timeText: string };

export function extractTime(text: string): TimeExtraction {
  let startsAt: string | null = null;
  let endsAt: string | null = null;
  let timeText = "";
  for (const date of findDates(text)) {
    const cue = cueBefore(text, date.index);
    if (cue === "end" && !endsAt) {
      endsAt = date.iso;
      const windowStart = Math.max(0, date.index - 60);
      const window = text.slice(windowStart, date.index + date.raw.length);
      const cueMatch = window.match(/through|until|before|expires|expiry|deadline|ends|ending|截止至?|截至|有效期至/i);
      timeText = (cueMatch?.index === undefined ? window : window.slice(cueMatch.index)).trim();
    } else if (cue === "start" && !startsAt) {
      startsAt = date.iso;
    }
  }
  if (!endsAt) {
    const duration = text.match(DURATION);
    if (duration) timeText = duration[0];
  }
  return { startsAt, endsAt, timeText };
}

export type ValueAssessment = {
  tier: ValueTier;
  amount: number | null;
  currency: string | null;
  valueText: string;
};

const MONEY =
  /(?<cur>US\$|USD|USDT|USDC|EUR|GBP|€|£|\$)\s*(?<num>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?<dec>\d{1,2}))?/gi;

function currencyOf(raw: string): { code: string; usdLike: boolean } {
  const upper = raw.toUpperCase();
  if (upper === "$" || upper === "US$" || upper === "USD") return { code: "USD", usdLike: true };
  if (upper === "USDT" || upper === "USDC") return { code: upper, usdLike: true };
  if (upper === "€" || upper === "EUR") return { code: "EUR", usdLike: false };
  if (upper === "£" || upper === "GBP") return { code: "GBP", usdLike: false };
  return { code: upper, usdLike: false };
}

export function assessValue(excerpt: string): ValueAssessment {
  const empty: ValueAssessment = { tier: "unverified", amount: null, currency: null, valueText: "" };
  type Candidate = { amount: number; currency: string; usdLike: boolean; raw: string; index: number; score: number };
  const candidates: Candidate[] = [];
  for (const match of excerpt.matchAll(MONEY)) {
    if (match.index === undefined || !match.groups) continue;
    const amount = Number(`${match.groups.num!.replace(/,/g, "")}${match.groups.dec ? `.${match.groups.dec}` : ""}`);
    if (!Number.isFinite(amount)) continue;
    const afterRaw = excerpt.slice(match.index + match[0].length, match.index + match[0].length + 36);
    const after = afterRaw.split(/US\$|USD|USDT|USDC|EUR|GBP|€|£|\$/)[0] ?? afterRaw;
    const before = excerpt.slice(Math.max(0, match.index - 12), match.index);
    const around = `${before} ${after}`.toLowerCase();
    let score = 1;
    if (/credit|bonus|welcome|cashback|reward/.test(around)) score += 3;
    if (/per month|\/month|\/mo\b|billed|per hour|\/hr|starting at/.test(around)) score -= 4;
    const currency = currencyOf(match.groups.cur!);
    candidates.push({
      amount,
      currency: currency.code,
      usdLike: currency.usdLike,
      raw: match[0],
      index: match.index,
      score,
    });
  }
  const viable = candidates.filter((item) => item.score > 0 && item.amount > 0);
  const preferred = viable.filter((item) => item.score >= 4);
  const pool = preferred.length ? preferred : viable;
  if (pool.length === 1) {
    const chosen = pool[0]!;
    if (!excerpt.includes(chosen.raw)) return empty;
    return {
      tier: chosen.usdLike ? "money" : "money_other",
      amount: chosen.amount,
      currency: chosen.currency,
      valueText: chosen.raw.trim(),
    };
  }
  if (pool.length > 1) {
    const amounts = new Set(pool.map((item) => `${item.currency}:${item.amount}`));
    if (amounts.size === 1) {
      const chosen = pool[0]!;
      return {
        tier: chosen.usdLike ? "money" : "money_other",
        amount: chosen.amount,
        currency: chosen.currency,
        valueText: chosen.raw.trim(),
      };
    }
  }

  const percent = excerpt.match(
    /\b(?:up to\s+)?\d+(?:\.\d+)?\s*%\s*(?:off|cashback|discount)\b|\bearn\s+\d+(?:\.\d+)?\s*%\s*cashback\b/i,
  );
  if (percent && excerpt.includes(percent[0])) {
    return { tier: "percent", amount: null, currency: null, valueText: percent[0] };
  }
  const quota = excerpt.match(
    /\b\d[\d,]*\s+per day\b|\b\d[\d,]*\s+projects\b|\b\d[\d,]*\s+minutes\/month\b|\b\d+\s*GB free\b|\b1 GB of storage\b|\b100,000 per day\b|\b\d+\s*TB\b/i,
  );
  if (quota && excerpt.includes(quota[0])) {
    return { tier: "quota", amount: null, currency: null, valueText: quota[0] };
  }
  const qualitative = excerpt.match(
    /free for everyone|at no cost|no monthly fees|no fees?|half the commission|freely available|for free|\$\s*0|no charge|\bfree\b/i,
  );
  if (qualitative && excerpt.toLowerCase().includes(qualitative[0].toLowerCase())) {
    return { tier: "qualitative", amount: null, currency: null, valueText: qualitative[0] };
  }
  return empty;
}

export function rankScore(value: ValueAssessment): number {
  if (value.tier === "money" && value.amount !== null) return 1000 + Math.min(value.amount, 100_000);
  if (value.tier === "money_other") return 500;
  if (value.tier === "percent") return 200;
  if (value.tier === "quota") return 150;
  if (value.tier === "qualitative") return 100;
  return 0;
}

export function classifyDealType(text: string): DealType {
  if (/invit|referral|refer-a-friend|邀请|推荐奖励/i.test(text)) return "invite";
  if (/trading volume|trade at least|volume requirement|交易量/i.test(text)) return "volume";
  if (/(deposit|top[- ]up|充值|入金)/i.test(text) && /(bonus|reward|required|必须|需)/i.test(text)) return "deposit";
  if (/always free/i.test(text) && /(12 months|for \d+ years?)/i.test(text)) return "unverified";
  if (/free trial|\btrial\b|免费试用|for a limited time|free for \d+|over\s+\d+\s+days|\b\d+\s*-day\b|for 12 months|for \d+ years?/i.test(text)) {
    return "trial";
  }
  if (/\bfree\b|at no cost|no charge|no[- ]fees?|\$\s*0|freely available/i.test(text)) return "free";
  return "unverified";
}

export function extractConditions(text: string): string {
  const parts = text
    .split(/(?<=[。.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) =>
      /only|must|require|eligible|resident|students?|new customers?|no credit card|limited usage|qualifying|terms apply|per month|government partners|public repositories|\b16\+|\b18\+/i.test(
        part,
      ),
    );
  return [...new Set(parts)].join(" ").slice(0, 500);
}

export function extractRegions(text: string): string {
  const patterns = [
    /UK residents only/i,
    /U\.?S\.? residents only/i,
    /United States only/i,
    /available in the EEA/i,
    /EEA only/i,
    /not available to residents of [^.]{3,80}/i,
    /excluding [^.]{3,80}/i,
    /\bworldwide\b/i,
  ];
  const hits = patterns.map((pattern) => text.match(pattern)?.[0]).filter((item): item is string => Boolean(item));
  return [...new Set(hits)].join(" · ").slice(0, 300);
}

export function extractSteps(raw: string): string {
  const items = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => match[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "")
    .filter((item) => item.length >= 4);
  if (items.length >= 2) return items.slice(0, 6).map((item, index) => `${index + 1}. ${item}`).join("\n");
  const numbered = raw.match(/(?:^|\n)\s*\d+[.)]\s+\S[^\n]{4,140}/g);
  if (numbered && numbered.length >= 2) return numbered.slice(0, 6).map((item) => item.trim()).join("\n");
  return "";
}

export function refineCategory(base: Category, text: string): Category {
  if (base === "crypto" || base === "bank" || base === "ucard" || base === "ai") return base;
  if (/\b(google vids|gemini|claude|chatgpt|copilot|ollama|ai gateway)\b/i.test(text)) return "ai";
  return base;
}

export function endInstant(endsAt: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) {
    const [year, month, day] = endsAt.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  }
  const parsed = Date.parse(endsAt);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export function isExpired(endsAt: string | null, now: Date): boolean {
  if (!endsAt) return false;
  const end = endInstant(endsAt);
  if (!end) return false;
  return end.getTime() < now.getTime();
}

export function isEndingSoon(endsAt: string | null, now: Date): boolean {
  if (!endsAt || isExpired(endsAt, now)) return false;
  const endDay = endsAt.slice(0, 10);
  const nowDay = now.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDay)) return false;
  const diff = utcDayNumber(endDay) - utcDayNumber(nowDay);
  return diff >= 0 && diff <= 7;
}

function utcDayNumber(isoDay: string): number {
  const [year, month, day] = isoDay.split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

export function shanghaiDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatWhen(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(parsed));
  return `${formatted} 北京时间`;
}

export function showSchedule(input: { startsAt: string | null; endsAt: string | null; timeText: string }): string {
  const parts: string[] = [];
  if (input.startsAt) parts.push(`开始 ${formatWhen(input.startsAt)}`);
  if (input.endsAt) parts.push(`截止 ${formatWhen(input.endsAt)}`);
  if (input.timeText) parts.push(input.timeText);
  if (!parts.length) return "待核实";
  let text = parts.join(" · ");
  if (!input.startsAt && !input.endsAt && input.timeText) {
    text += "（来源给了时长或笼统期限，没有日历截止日）";
  }
  return text;
}

export function reconcilePlan(input: {
  kind: "page" | "feed";
  fetchOk: boolean;
  existingIds: string[];
  seenIds: string[];
}): string[] {
  if (input.kind !== "page" || !input.fetchOk) return [];
  const seen = new Set(input.seenIds);
  return input.existingIds.filter((id) => !seen.has(id));
}
