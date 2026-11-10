import { isEndingSoon, isExpired, shanghaiDay } from "./extract";
import type { Board, BoardSectionId, DealRecord } from "./types";

function stamp(deal: DealRecord): string {
  return deal.publishedAt ?? deal.firstSeenAt;
}

function byNewest(a: DealRecord, b: DealRecord): number {
  return stamp(b).localeCompare(stamp(a)) || a.title.localeCompare(b.title);
}

function byRank(a: DealRecord, b: DealRecord): number {
  return b.rankScore - a.rankScore || stamp(b).localeCompare(stamp(a)) || a.title.localeCompare(b.title);
}

function dayOf(deal: DealRecord): string {
  const parsed = new Date(stamp(deal));
  if (Number.isNaN(parsed.getTime())) return "";
  return shanghaiDay(parsed);
}

export function buildBoard(deals: DealRecord[], now: Date): Board {
  const archivedIds = new Set(
    deals
      .filter((deal) => deal.status === "archived" || (deal.endsAt !== null && isExpired(deal.endsAt, now)))
      .map((deal) => deal.id),
  );
  const active = deals.filter((deal) => !archivedIds.has(deal.id));
  const archive = deals.filter((deal) => archivedIds.has(deal.id)).sort(byNewest);
  const today = shanghaiDay(now);
  const sections: Record<BoardSectionId, DealRecord[]> = {
    A: active.filter((deal) => dayOf(deal) === today).sort(byNewest),
    B: [...active].sort(byRank).slice(0, 12),
    C: active.filter((deal) => deal.category === "ai").sort(byRank),
    D: active.filter((deal) => deal.category === "crypto").sort(byRank),
    E: active.filter((deal) => deal.category === "bank" || deal.category === "ucard").sort(byRank),
    F: active.filter((deal) => deal.category === "vps").sort(byRank),
    G: active.filter((deal) => isEndingSoon(deal.endsAt, now)).sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? "")),
    H: archive,
  };
  return { feed: [...deals].sort(byNewest).slice(0, 80), sections, activeCount: active.length };
}

export const SECTION_META: Record<BoardSectionId, { title: string; note: string }> = {
  A: {
    title: "今日最新优惠",
    note: "按北京时间的日历日。有来源发布时间的，用发布时间；没有的，用本站第一次收录的时间。",
  },
  B: {
    title: "高价值优惠排行榜",
    note: "只按来源写出的金额、比例或免费表述排序。待核实排在后面。不同货币不换算。",
  },
  C: { title: "AI工具免费与折扣专区", note: "类别为 AI订阅优惠 的在册条目。" },
  D: { title: "Crypto空投与积分专区", note: "只收录来源原文写明优惠的加密资产条目，并附固定风险提示。" },
  E: { title: "海外银行与银行卡优惠", note: "海外银行与 U卡 / 虚拟卡。金融条目都有固定风险提示。" },
  F: { title: "VPS及云服务专区", note: "云主机、额度和开发者基础设施。软件优惠在情报流里，不放进本区。" },
  G: { title: "即将截止的活动", note: "来源给出了日历截止日，且落在未来 7 个 UTC 日期内。只写了「90 天」「限时」而没有日期的，不会出现在这里。" },
  H: { title: "已结束活动档案", note: "日历截止日已过，或官方页面这次已经匹配不到原先的表述。" },
};
