/**
 * Proper nouns the machine translator has rendered as unrelated Chinese words.
 * Corrections run at display time and again before a new translation is stored.
 * Amounts, dates, and eligibility text are not rewritten; only these names move.
 */
const LOCKED_TERMS = [
  "Gemini 4 Carbon",
  "Cloudflare Workers",
  "Parallel Decisions",
  "Kraken Prop",
  "JetBrains",
  "MongoDB",
  "Anthropic",
  "Supabase",
  "Starling",
  "Railway",
  "Workers",
  "Claude",
  "Monzo",
  "Azure",
  "Neon",
];

const BAD_FORMS: Array<{ term: string; source: string; flags: string }> = [
  { term: "Gemini 4 Carbon", source: "双胞胎\\s*4\\s*碳|双子座\\s*4\\s*碳|双子\\s*4\\s*碳", flags: "g" },
  { term: "Cloudflare Workers", source: "Cloudflare\\s*工人(?:文件|文档)?", flags: "g" },
  { term: "Parallel Decisions", source: "平行决策", flags: "g" },
  { term: "Anthropic", source: "人类", flags: "g" },
  { term: "Railway", source: "铁路", flags: "g" },
  { term: "Starling", source: "斯大林", flags: "g" },
  { term: "Claude", source: "克劳德", flags: "g" },
  { term: "Neon", source: "尼昂", flags: "g" },
  { term: "Workers", source: "工人", flags: "g" },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace a known bad rendering when the English source actually names that term. */
export function protectProperNouns(chinese: string, source: string): string {
  if (!chinese || !source) return chinese;
  const haystack = source.toLowerCase();
  let out = chinese;
  for (const entry of BAD_FORMS) {
    if (!haystack.includes(entry.term.toLowerCase())) continue;
    out = out.replace(new RegExp(entry.source, entry.flags), entry.term);
  }
  return out;
}

/**
 * Hide locked names before the model call, then put the original spelling back.
 * A fresh regular expression is used per call so global lastIndex cannot leak.
 */
export function shieldProperNouns(text: string): { text: string; restore: (translated: string) => string } {
  const found: string[] = [];
  let shielded = text;
  const terms = [...LOCKED_TERMS].sort((a, b) => b.length - a.length);
  for (const term of terms) {
    shielded = shielded.replace(new RegExp(escapeRegExp(term), "gi"), (match) => {
      const token = `⟦${found.length}⟧`;
      found.push(match);
      return token;
    });
  }
  return {
    text: shielded,
    restore(translated: string) {
      const restored = translated.replace(/⟦(\d+)⟧/g, (_token, index: string) => found[Number(index)] ?? "");
      return protectProperNouns(restored, text);
    },
  };
}
