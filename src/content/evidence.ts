import type { DealRecord } from "../types";
import { endInstant, extractRegions } from "../extract";

export const REGIONS = {
  cn: "中国大陆", hk: "中国香港", tw: "中国台湾", us: "美国", ca: "加拿大",
  gb: "英国", eu: "欧盟", in: "印度", jp: "日本", sg: "新加坡", au: "澳大利亚",
} as const;

const regionPatterns: Record<keyof typeof REGIONS, RegExp> = {
  cn: /mainland china|中国大陆/i, hk: /hong kong|香港/i, tw: /taiwan|台湾/i,
  us: /united states|\bUSA?\b|\bU\.S\.|美国/i, ca: /canada|加拿大/i, gb: /united kingdom|\bUK\b|英国/i,
  eu: /european union|\b(?:EU|EEA)\b|欧盟/i, in: /\bindia\b|印度/i, jp: /\bjapan\b|日本/i,
  sg: /singapore|新加坡/i, au: /australia|澳大利亚/i,
};

export function offerEvidence(deal: DealRecord) {
  const original = deal.summary.replace(/\s+/g, " ");
  const paymentFree = original.match(/no (?:(?:credit |debit )?card|payment method)(?: (?:is )?required|(?=\s*[:.;,)\u3002]|$))|without (?:a )?(?:credit|debit) card|无需(?:信用卡|绑卡)/i)?.[0] ?? "";
  const paymentRequired = (paymentFree ? original.replace(paymentFree, "") : original).match(/(?:a )?(?:(?:valid )?(?:credit|debit) card|payment method) (?:is |are )?(?:required|needed)|(?:must|need to) (?:provide|add|link) (?:a )?(?:(?:credit|debit) card|payment method)|including a verified phone number and a payment method|需要(?:绑定)?(?:信用卡|付款方式)|需绑卡/i)?.[0] ?? "";
  const renewalOff = original.match(/does not automatically renew|no auto(?:matic)?[- ]renewal|won['’]t automatically (?:renew|charge)|不会自动(?:续费|扣费)|不自动续费/i)?.[0] ?? "";
  const renewalOn = (renewalOff ? original.replace(renewalOff, "") : original).match(/(?<!not )automatically (?:renews?|converts? to (?:a )?paid|rolls? over to (?:a )?paid)|(?<!not )auto[- ]renews?|(?<![不无])自动(?:续费|转为付费|扣费)/i)?.[0]
    ?? deal.title.match(/free trials? (?:now )?converts? automatically to paid subscriptions?/i)?.[0] ?? "";
  const eligibility = original.match(/(?:new (?:customers|users|accounts)(?: only)?|first[- ]time (?:customers|users)|new users who[^.!。]{1,85}|(?:verified |eligible )?students|qualifying educational institutions|仅限新用户|学生认证|在校学生)/i)?.[0] ?? "";
  const followup = original.match(/(?:then|afterwards|after that|after the trial(?: ends)?)\s+[^.!。;]{0,50}?(?:\$\s*\d+(?:\.\d+)?(?:\s*(?:per|\/)\s*(?:month|year|hour))?|pay[- ]as[- ]you[- ]go|paid (?:plan|subscription))|when (?:a|the) free trial ends[^.!。;]{0,120}?usage-based pricing|试用后[^。；]{1,42}/i)?.[0] ?? "";
  const regionText = deal.regions.trim() || extractRegions(original);
  const excluded = /\b(?:except|excluding|not available|unavailable)\b|不适用|除外/i.test(original + " " + regionText);
  const regions = excluded ? [] : /worldwide|globally|all countries|全球/i.test(regionText)
    ? ["global"]
    : Object.entries(regionPatterns).filter(([, pattern]) => pattern.test(regionText)).map(([code]) => code);
  const card = paymentFree && paymentRequired ? "conflict" : paymentFree ? "no" : paymentRequired ? "yes" : "unknown";
  const renewal = renewalOff && renewalOn ? "conflict" : renewalOff ? "no" : renewalOn ? "yes" : "unknown";
  return {
    card, renewal, paymentQuote: [paymentFree, paymentRequired].filter(Boolean).join(" / "),
    renewalQuote: [renewalOff, renewalOn].filter(Boolean).join(" / "),
    eligibility, followup, regions, regionText,
    student: /students|educational institutions|学生|院校/i.test(eligibility),
    deadline: deal.endsAt ? endInstant(deal.endsAt)?.getTime() ?? 0 : 0,
  };
}

export function offerRevision(deal: DealRecord, evidence: ReturnType<typeof offerEvidence>): string {
  const fields = [deal.valueText, deal.conditions, deal.regions, deal.endsAt, deal.timeText,
    deal.startsAt, evidence.regionText, evidence.eligibility, evidence.card, evidence.renewal, evidence.followup];
  let hash = 2166136261;
  for (const character of JSON.stringify(fields)) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(36);
}
