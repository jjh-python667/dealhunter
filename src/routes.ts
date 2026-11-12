export type ChannelKey = "ai" | "cloud";

export type ChannelInfo = {
  key: ChannelKey;
  path: string;
  navKey: "ai-tools" | "cloud";
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  category: "ai" | "vps";
  note: string;
  emptyTitle: string;
  emptyNote: string;
};

/** The two public channels. Both pages reuse the discovery toolbar and client. */
export const CHANNELS: Record<ChannelKey, ChannelInfo> = {
  ai: {
    key: "ai",
    path: "/ai-tools",
    navKey: "ai-tools",
    label: "AI 工具",
    eyebrow: "AI TOOLS · 频道",
    title: "AI 工具优惠",
    description: "AI 订阅、模型额度与开发工具优惠。先核对资格和到期时间，再打开官方入口。",
    category: "ai",
    note: "只显示类别为「AI 订阅优惠」的在册情报。金额、资格与期限以来源原文为准。",
    emptyTitle: "频道里暂时没有匹配的 AI 优惠",
    emptyNote: "试试更短的关键词，或清除地区、条件与期限筛选。",
  },
  cloud: {
    key: "cloud",
    path: "/cloud",
    navKey: "cloud",
    label: "云服务",
    eyebrow: "CLOUD · 频道",
    title: "云服务优惠",
    description: "云主机、免费额度与开发者基础设施优惠。先确认绑定与续费规则，再领取。",
    category: "vps",
    note: "只显示类别为「VPS 及云服务」的在册情报。金额、资格与期限以来源原文为准。",
    emptyTitle: "频道里暂时没有匹配的云服务优惠",
    emptyNote: "试试更短的关键词，或清除地区、条件与期限筛选。",
  },
};

export function isChannelKey(value: string): value is ChannelKey {
  return value === "ai" || value === "cloud";
}

export type Route =
  | { kind: "home" }
  | { kind: "deals" }
  | { kind: "channel"; channel: ChannelKey }
  | { kind: "detail"; id: string }
  | { kind: "redirect"; location: string; status: 301 | 302 }
  | { kind: "notFound" };

/** Query keys that belonged to the pre-portal dashboard. They must keep working. */
const LEGACY_HOME_KEYS = ["view", "q", "category", "type", "sort", "page", "evidence", "offer", "focus"];

function cleanPath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

function decodeDealId(segment: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (!id || id === "." || id === "..") return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/.test(id)) return null;
  return id;
}

/**
 * One pure route resolver, shared by the Worker and the local preview server.
 * It never touches the database: callers decide what to load for the route.
 */
export function resolveRoute(url: URL): Route {
  const path = cleanPath(url.pathname);
  if (path === "/") {
    if (LEGACY_HOME_KEYS.some((key) => url.searchParams.has(key))) {
      return { kind: "redirect", location: `/deals${url.search}`, status: 302 };
    }
    return { kind: "home" };
  }
  if (path === "/deals") return { kind: "deals" };
  if (path === CHANNELS.ai.path) return { kind: "channel", channel: "ai" };
  if (path === CHANNELS.cloud.path) return { kind: "channel", channel: "cloud" };
  if (path.startsWith("/deal/")) {
    const id = decodeDealId(path.slice("/deal/".length));
    return id ? { kind: "detail", id } : { kind: "notFound" };
  }
  return { kind: "notFound" };
}

export function langFromUrl(url: URL): "zh" | "en" {
  return url.searchParams.get("lang") === "en" ? "en" : "zh";
}
