import type { DealRecord } from "../types";
import { CATEGORY_LABEL } from "../labels";
import { ZH_GUIDES } from "./zh-guides";

type Guide = typeof ZH_GUIDES[number];
const key = (sourceId: string, title: string, summary: string) => JSON.stringify([sourceId, title, summary]);
const guides = new Map<string, Guide>(ZH_GUIDES.map(guide => [key(guide.sourceId, guide.sourceTitle, guide.sourceSummary), guide]));
const PHRASES: Record<string, string> = {
  "free": "免费", "for free": "免费", "at no cost": "免费", "freely available": "免费提供",
  "no fees": "不收取费用", "no monthly fees": "不收月费", "10gb free": "10GB 免费额度",
  "100 projects": "100 个项目", "50,000 minutes/month": "每月 50,000 分钟",
  "100,000 per day": "每日 100,000 次", "40% discount": "优惠 40%",
  "up to 90% off": "最高减免 90%", "earn 1% cashback": "1% 返现", "half the commission": "佣金减半",
  "uk residents only": "仅限英国居民", "for 12 months": "持续 12 个月", "over 90 days": "90 天内",
  "for 1 year": "持续 1 年", "30-day": "30 天", "for a limited time": "限时，未注明日历截止日",
  "through november 13, 2026": "截至 2026 年 11 月 13 日",
  "students get google ai pro free for 1 year.": "学生可免费使用 Google AI Pro 一年。",
};

export function chineseCopy(deal: DealRecord) {
  // A changed original invalidates the edited copy immediately. Stored AI translations win.
  const guide = guides.get(key(deal.sourceId, deal.title, deal.summary));
  const title = deal.zhTitle?.trim() || guide?.titleZh || "";
  const summary = deal.zhSummary?.trim() || guide?.summaryZh || "";
  const machine = Boolean(deal.zhTitle?.trim() || deal.zhSummary?.trim());
  const intro = guide?.introZh || summary || `这条记录来自 ${deal.sourceName}，收录于${CATEGORY_LABEL[deal.category]}。先阅读来源摘要，再核对参与条件、适用地区与期限。`;
  function field(original: string): string | undefined {
    if (!original.trim()) return undefined;
    if (original === deal.title && title) return title;
    if (original === deal.summary && summary) return summary;
    return PHRASES[original.trim().toLowerCase()];
  }
  return { title, summary, intro, edited: Boolean(guide), machine, field };
}
