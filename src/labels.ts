export const CATEGORIES = ["ai", "crypto", "ucard", "bank", "vps", "software", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const DEAL_TYPES = ["free", "trial", "deposit", "volume", "invite", "unverified"] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const VALUE_TIERS = ["money", "money_other", "percent", "quota", "qualitative", "unverified"] as const;
export type ValueTier = (typeof VALUE_TIERS)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  ai: "AI订阅优惠",
  crypto: "Crypto",
  ucard: "U卡",
  bank: "海外银行",
  vps: "VPS及云服务",
  software: "软件与数字服务",
  other: "其他",
};

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  free: "真免费",
  trial: "免费试用",
  deposit: "需充值",
  volume: "需交易量",
  invite: "需邀请",
  unverified: "待核实",
};

export const PENDING = "待核实";

export function show(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text ? text : PENDING;
}

const CRYPTO_RISK =
  "加密资产相关活动可能导致本金损失，规则、额度与资格可能随时变更。请只通过你自行核对的官方域名操作，不要向任何人转账或提供私钥、助记词或验证码。本站摘录不构成投资建议。";

const FINANCE_RISK =
  "银行与卡片优惠受地区监管、身份审核和机构条款约束，返现、费率和资格以主办方当时页面为准。请核对官方域名，谨防仿冒网站和代办中介。本站摘录不构成开户或办卡建议。";

export function riskNote(category: Category, excerpt: string): string {
  const base = category === "crypto" ? CRYPTO_RISK : category === "bank" || category === "ucard" ? FINANCE_RISK : "";
  if (!base) return "";
  if (/guaranteed return|risk[- ]free|稳赚|无风险|保本/i.test(excerpt)) {
    return `${base} 来源文本含有收益或无风险一类用语，请只把它当成原文用词，不要当成承诺。`;
  }
  return base;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isDealType(value: string): value is DealType {
  return (DEAL_TYPES as readonly string[]).includes(value);
}
