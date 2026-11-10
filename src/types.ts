import type { Category, DealType, ValueTier } from "./labels";

export type DealRecord = {
  id: string;
  title: string;
  category: Category;
  summary: string;
  valueText: string;
  valueAmount: number | null;
  valueCurrency: string | null;
  valueTier: ValueTier;
  conditions: string;
  regions: string;
  startsAt: string | null;
  endsAt: string | null;
  timeText: string;
  steps: string;
  officialUrl: string;
  sourceName: string;
  sourceUrl: string;
  sourceId: string;
  lastVerifiedAt: string;
  riskNote: string;
  dealType: DealType;
  status: "active" | "archived";
  publishedAt: string | null;
  rankScore: number;
  firstSeenAt: string;
  updatedAt: string;
  archiveReason: string;
  zhTitle?: string;
  zhSummary?: string;
};

export type SourceCheck = {
  sourceId: string;
  sourceUrl: string;
  httpStatus: number | null;
  ok: boolean;
  error: string;
  itemsSeen: number;
  itemsKept: number;
  checkedAt: string;
};

export type RunRecord = {
  id: string;
  trigger: string;
  cron: string | null;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  inserted: number;
  updated: number;
  archived: number;
  skipped: number;
  error: string;
};

export type BoardSectionId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type Board = {
  feed: DealRecord[];
  sections: Record<BoardSectionId, DealRecord[]>;
  activeCount: number;
};
