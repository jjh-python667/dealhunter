import type { Category } from "./labels";

export type SourceDef = {
  id: string;
  name: string;
  url: string;
  kind: "feed" | "page";
  category: Category;
  /** Single verbatim excerpt. The deal is kept only when this matches. */
  pattern?: RegExp;
  /** Several verbatim excerpts from one official page. */
  repeatPattern?: RegExp;
  repeatMax?: number;
};

export const USER_AGENT = "Mozilla/5.0 (compatible; DealHunter/1.0; public-source-reader)";

export const SOURCES: SourceDef[] = [
  { id: "ollama-blog", name: "Ollama Blog", url: "https://ollama.com/blog/rss.xml", kind: "feed", category: "ai" },
  {
    id: "google-cloud-blog",
    name: "Google Cloud Blog",
    url: "https://blog.google/products/google-cloud/rss/",
    kind: "feed",
    category: "vps",
  },
  {
    id: "digitalocean-blog",
    name: "DigitalOcean Blog",
    url: "https://www.digitalocean.com/blog/rss",
    kind: "feed",
    category: "vps",
  },
  { id: "kraken-blog", name: "Kraken Blog", url: "https://blog.kraken.com/feed", kind: "feed", category: "crypto" },
  { id: "vercel-changelog", name: "Vercel Changelog", url: "https://vercel.com/atom", kind: "feed", category: "software" },
  { id: "neon-blog", name: "Neon Blog", url: "https://neon.tech/blog/rss.xml", kind: "feed", category: "vps" },
  { id: "openai-news", name: "OpenAI News", url: "https://openai.com/news/rss.xml", kind: "feed", category: "ai" },
  {
    id: "ethereum-blog",
    name: "Ethereum Foundation Blog",
    url: "https://blog.ethereum.org/feed.xml",
    kind: "feed",
    category: "crypto",
  },
  { id: "cloudflare-blog", name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", kind: "feed", category: "vps" },
  {
    id: "github-changelog",
    name: "GitHub Changelog",
    url: "https://github.blog/changelog/feed/",
    kind: "feed",
    category: "software",
  },
  {
    id: "aws-whats-new",
    name: "AWS What's New",
    url: "https://aws.amazon.com/about-aws/whats-new/recent/feed/",
    kind: "feed",
    category: "vps",
  },
  {
    id: "claude-pricing",
    name: "Claude Pricing",
    url: "https://claude.com/pricing",
    kind: "page",
    category: "ai",
    pattern: /\$0\s+Free for everyone[\s\S]{0,80}?Limited usage every 5 hours and every week/i,
  },
  {
    id: "google-one-students",
    name: "Google One",
    url: "https://one.google.com/about/",
    kind: "page",
    category: "ai",
    pattern: /Students get Google AI Pro free for 1 year\.[\s\S]{0,180}?5 TB of storage\./,
  },
  {
    id: "gemini-subscriptions",
    name: "Gemini subscriptions",
    url: "https://gemini.google/subscriptions/",
    kind: "page",
    category: "ai",
    pattern: /\$0\s*\/\s*month with a Google Account/,
  },
  {
    id: "gcp-free-docs",
    name: "Google Cloud Free Program docs",
    url: "https://docs.cloud.google.com/free/docs/free-cloud-features",
    kind: "page",
    category: "vps",
    pattern: /\$300 Welcome credit to spend over 90 days[\s\S]{0,140}?won't be billed/,
  },
  {
    id: "neon-pricing",
    name: "Neon Pricing",
    url: "https://neon.com/pricing",
    kind: "page",
    category: "vps",
    pattern: /Neon['’]s Free plan is \$0 with no credit card: 100 projects, each with 100 CU-hours and 1 GB of storage\.?/,
  },
  {
    id: "railway-pricing",
    name: "Railway Pricing",
    url: "https://railway.com/pricing",
    kind: "page",
    category: "vps",
    pattern: /Start with a 30-day free trial with \$5 credits, then \$1 per month[\s\S]{0,200}?No credit card required/i,
  },
  {
    id: "supabase-pricing",
    name: "Supabase Pricing",
    url: "https://supabase.com/pricing",
    kind: "page",
    category: "vps",
    pattern: /Start for Free\s+\$\s*0\s*\/\s*month[\s\S]{0,90}?50,000 monthly active users[\s\S]{0,50}?500 MB database size/i,
  },
  {
    id: "fly-pricing",
    name: "Fly.io Pricing",
    url: "https://docs.fly.io/about/pricing",
    kind: "page",
    category: "vps",
    pattern: /First 10GB free each month/,
  },
  {
    id: "workers-pricing",
    name: "Cloudflare Workers Pricing",
    url: "https://developers.cloudflare.com/workers/platform/pricing/",
    kind: "page",
    category: "vps",
    pattern: /Free\s+100,000 per day\s+No charge for duration\s+10 milliseconds of CPU time per invocation/,
  },
  {
    id: "monzo-account",
    name: "Monzo Current Account",
    url: "https://monzo.com/current-account",
    kind: "page",
    category: "bank",
    pattern: /Open a free Monzo account[\s\S]{0,140}?UK residents only/,
  },
  {
    id: "n26-home",
    name: "N26",
    url: "https://n26.com/en-eu",
    kind: "page",
    category: "bank",
    pattern: /Open your free bank account in minutes/,
  },
  {
    id: "starling-home",
    name: "Starling Bank",
    url: "https://www.starlingbank.com/",
    kind: "page",
    category: "bank",
    pattern: /No monthly fees and free 24\/7 UK support/,
  },
  {
    id: "ally-checking",
    name: "Ally Bank Spending Account",
    url: "https://www.ally.com/bank/interest-checking-account/",
    kind: "page",
    category: "bank",
    pattern: /75,000\+\s*no-fee ATMs and add cash for free nationwide/,
  },
  {
    id: "privacy-cards",
    name: "Privacy.com",
    url: "https://www.privacy.com/",
    kind: "page",
    category: "ucard",
    pattern: /Our basic plan has no fees on domestic transactions/,
  },
  {
    id: "curve-home",
    name: "Curve",
    url: "https://www.curve.com/",
    kind: "page",
    category: "ucard",
    pattern: /save up to 3% in foreign transaction fees.{0,16}plus earn 1% cashback/i,
  },
  {
    id: "azure-account",
    name: "Azure account offers",
    url: "https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account",
    kind: "page",
    category: "vps",
    pattern: /Some are always free to all Azure customers, and some are free for 12 months to new customers only/,
  },
  {
    id: "github-pricing",
    name: "GitHub Pricing",
    url: "https://github.com/pricing",
    kind: "page",
    category: "software",
    pattern: /50,000 minutes\/month\s+Free for public repositories/,
  },
  {
    id: "github-student-pack",
    name: "GitHub Student Developer Pack",
    url: "https://education.github.com/pack",
    kind: "page",
    category: "software",
    repeatPattern: /Offer\s+\$[\d,]+(?:\.\d{2})?\s+(?:in\s+)?[A-Za-z][^.]{8,200}/g,
    repeatMax: 6,
  },
  {
    id: "jetbrains-student-pack",
    name: "JetBrains Student Pack",
    url: "https://www.jetbrains.com/academy/student-pack/",
    kind: "page",
    category: "software",
    pattern: /Free JetBrains Student Pack/,
  },
  {
    id: "anthropic-news",
    name: "Anthropic Newsroom",
    url: "https://www.anthropic.com/news",
    kind: "page",
    category: "ai",
    pattern: /government partners a 40% discount on Claude Enterprise, Claude for Government, and the Claude API/i,
  },
];

export function matchPage(text: string, source: SourceDef): string[] {
  if (source.kind !== "page") return [];
  if (source.repeatPattern) {
    const flags = source.repeatPattern.flags.includes("g")
      ? source.repeatPattern.flags
      : `${source.repeatPattern.flags}g`;
    const pattern = new RegExp(source.repeatPattern.source, flags);
    return [...text.matchAll(pattern)].map((match) => match[0].trim()).filter(Boolean).slice(0, source.repeatMax ?? 5);
  }
  if (!source.pattern) return [];
  const match = text.match(source.pattern);
  return match?.[0] ? [match[0].trim()] : [];
}
