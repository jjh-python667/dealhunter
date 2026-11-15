export type SiteLang = "zh" | "en";

/** Document language must match `data-lang`: Chinese pages are zh-CN, English pages are en. */
export function htmlLang(lang: SiteLang): "en" | "zh-CN" {
  return lang === "en" ? "en" : "zh-CN";
}

export type DocumentCopy = {
  title: string;
  description: string;
  h1: string;
  lede: string;
};

/** Homepage document title, description, and hero. Chinese copy stays byte-for-byte. */
export function homeDocument(lang: SiteLang): DocumentCopy {
  if (lang === "en") {
    return {
      title: "Global Deal Hunter",
      description: "Global Deal Hunter lists public AI-tool, cloud, student, and digital offers. Read the source beside the notes. Amounts, eligibility, and deadlines follow the official page.",
      h1: "Global Deal Hunter",
      lede: "AI tools, cloud services, student resources, and digital offers. Read the notes, then check region, deadline, and terms against the source. Amounts and eligibility follow the offer page.",
    };
  }
  return {
    title: "全球羊毛情报中心 · GLOBAL DEAL HUNTER",
    description: "全球羊毛情报中心：公开来源中的 AI 工具、云服务、学生资源与数字优惠。中文整理 + 原文对照，金额、资格与期限以活动原文为准。",
    h1: "全球羊毛情报中心",
    lede: "汇集 AI 工具、云服务、学生资源与数字优惠。先看中文整理，再按地区、期限与条件核对来源原文；金额与资格以活动页面为准。",
  };
}

/** Discovery board (`/deals`) document title and hero. */
export function dealsDocument(lang: SiteLang): DocumentCopy {
  if (lang === "en") {
    return {
      title: "All deals · GLOBAL DEAL HUNTER",
      description: "All public AI-tool, cloud, and digital offers. Read the source, filter by category, and save deals in this browser. Amounts and eligibility follow the official page.",
      h1: "All deals",
      lede: "AI tools, cloud services, student resources, and digital offers. Read the source first, then check region, deadline, and terms.",
    };
  }
  return {
    title: "全球羊毛情报中心 · GLOBAL DEAL HUNTER",
    description: "全球羊毛情报中心：发现公开来源中的 AI 工具、云服务与数字优惠。支持中文阅读、原文对照、分类筛选和本机收藏。金额与资格以活动原文为准。",
    h1: "全球羊毛情报中心",
    lede: "汇集 AI 工具、云服务、学生资源与数字优惠。先看中文简介，再按地区、期限和条件核对原文。",
  };
}
