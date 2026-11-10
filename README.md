# GLOBAL DEAL HUNTER｜全球羊毛情报中心

公开的优惠情报站。它按固定规则抓取一批公开 RSS/Atom 和官方页面，把来源原文里写明的优惠整理进看板。来源没有写的金额、日期、地区、条件，页面上显示「待核实」，不会补造。

这个仓库没有部署。`wrangler.jsonc` 里的 `database_id` 是占位符，不是真实数据库。Worker 名称是 `dealhunter`，不要把它部署到、也不要改动已有的 `newsdesk`。

## 它做什么

- 7 个类别：AI 订阅优惠、Crypto、U 卡、海外银行、VPS 及云服务、软件与数字服务、其他。
- Cron `0 */2 * * *`（UTC，每 2 小时的整点）调用 `scheduled()`，走同一套采集函数。
- 用规范化后的官方链接去重。同一条再次出现时更新验证时间，不新增一行。
- 只有来源文本里带有截止提示（until、through、ends、截止等）的日历日期才会写成截止日。`90 days`、`30-day`、`for a limited time` 只保留原文，不换算成某一天。
- 截止日已过的条目标成归档。官方页面这次对不上原先那句原文时，也会归档，并写明原因。RSS 里不再出现的旧条目不会因此归档。
- 排序只用来源里能读出来的信息：写明的美元或稳定币金额优先，然后是其他货币（不换汇）、百分比、额度、定性的「免费」，「待核实」排在最后。
- Crypto、海外银行、U 卡一律带固定风险提示。
- 链接会去掉常见跟踪参数和邀请参数。联盟跳转域名、`/invite/`、`/referral/` 路径直接丢弃。

优惠类型只在原文对得上时才标成：真免费、免费试用、需充值、需交易量、需邀请。对不上就是「待核实」。有明确截止日的「免费」会标成免费试用，因为来源自己写了结束时间。

## 架构

```text
Cron / 管理接口
    → src/collect.ts 逐个抓取种子源（最多读 160KB）
    → src/parse.ts 解析 RSS/Atom（每源最多 15 条，每条最多 12KB）
    → src/extract.ts 判断是不是优惠、抽日期、金额、条件、地区
    → 本地或远程 D1（deals / runs / source_checks）
    → src/page.ts 渲染中文看板
```

公开只读：

- `GET /` 看板
- `GET /api/health`
- `GET /api/board`
- `GET /api/runs` 最近一轮采集和每个来源的 HTTP 结果

写入只有：

- `POST /api/admin/collect`，请求头 `Authorization: Bearer <ADMIN_TOKEN>` 或 `X-Admin-Token`
- Cron 触发的 `scheduled()`

令牌用 `crypto.subtle.digest("SHA-256")` 之后再比较。环境里没有 `ADMIN_TOKEN` 时管理接口返回 503，不会变成公开写入。令牌不进仓库。本地放 `.dev.vars`（已忽略），仓库里只有 `.dev.vars.example`。

看板分区：

| 分区 | 内容 |
| --- | --- |
| A 今日最新优惠 | 北京时间当天。有来源发布时间就用发布时间，没有就用第一次收录时间 |
| B 高价值优惠排行榜 | 按上面的排序，最多 12 条 |
| C AI工具免费与折扣专区 | AI |
| D Crypto空投与积分专区 | Crypto |
| E 海外银行与银行卡优惠 | 海外银行 + U 卡 |
| F VPS及云服务专区 | VPS / 云 |
| G 即将截止的活动 | 有日历截止日，且在未来 7 个 UTC 日期内 |
| H 已结束活动档案 | 已过截止日，或页面原文对不上了 |

软件与数字服务没有单独字母区，出现在情报流以及 A、B、G、H。

## 种子来源与这次本地核验

下面是 2026-11-10 在这台机器上、用最终代码触发 `scheduled()` 的结果。31 个种子全部 HTTP 200，没有抓取失败。`收录 0` 表示页面打开了，但最近条目里没有对上优惠规则，系统没有编一条进去。

| 来源 | URL | HTTP | 看到 | 收录 |
| --- | --- | --- | --- | --- |
| Ollama Blog | https://ollama.com/blog/rss.xml | 200 | 15 | 2 |
| Google Cloud Blog | https://blog.google/products/google-cloud/rss/ | 200 | 15 | 2 |
| DigitalOcean Blog | https://www.digitalocean.com/blog/rss | 200 | 8 | 1 |
| Kraken Blog | https://blog.kraken.com/feed | 200 | 10 | 1 |
| Vercel Changelog | https://vercel.com/atom | 200 | 15 | 1 |
| Neon Blog | https://neon.tech/blog/rss.xml | 200 | 15 | 1 |
| OpenAI News | https://openai.com/news/rss.xml | 200 | 15 | 0 |
| Ethereum Foundation Blog | https://blog.ethereum.org/feed.xml | 200 | 15 | 0 |
| Cloudflare Blog | https://blog.cloudflare.com/rss/ | 200 | 11 | 0 |
| GitHub Changelog | https://github.blog/changelog/feed/ | 200 | 10 | 0 |
| AWS What's New | https://aws.amazon.com/about-aws/whats-new/recent/feed/ | 200 | 15 | 0 |
| Claude Pricing | https://claude.com/pricing | 200 | 1 | 1 |
| Google One | https://one.google.com/about/ | 200 | 1 | 1 |
| Gemini subscriptions | https://gemini.google/subscriptions/ | 200 | 1 | 1 |
| Google Cloud Free Program docs | https://docs.cloud.google.com/free/docs/free-cloud-features | 200 | 1 | 1 |
| Neon Pricing | https://neon.com/pricing | 200 | 1 | 1 |
| Railway Pricing | https://railway.com/pricing | 200 | 1 | 1 |
| Supabase Pricing | https://supabase.com/pricing | 200 | 1 | 1 |
| Fly.io Pricing | https://docs.fly.io/about/pricing | 200 | 1 | 1 |
| Cloudflare Workers Pricing | https://developers.cloudflare.com/workers/platform/pricing/ | 200 | 1 | 1 |
| Monzo Current Account | https://monzo.com/current-account | 200 | 1 | 1 |
| N26 | https://n26.com/en-eu | 200 | 1 | 1 |
| Starling Bank | https://www.starlingbank.com/ | 200 | 1 | 1 |
| Ally Bank Spending Account | https://www.ally.com/bank/interest-checking-account/ | 200 | 1 | 1 |
| Privacy.com | https://www.privacy.com/ | 200 | 1 | 1 |
| Curve | https://www.curve.com/ | 200 | 1 | 1 |
| Azure account offers | https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account | 200 | 1 | 1 |
| GitHub Pricing | https://github.com/pricing | 200 | 1 | 1 |
| GitHub Student Developer Pack | https://education.github.com/pack | 200 | 1 | 1 |
| JetBrains Student Pack | https://www.jetbrains.com/academy/student-pack/ | 200 | 1 | 1 |
| Anthropic Newsroom | https://www.anthropic.com/news | 200 | 1 | 1 |

这一轮写入 28 条，更新 0，归档 0，跳过 136 条不像优惠的 feed 条目。类别计数（全部为未归档）：

| 类别 | 条数 |
| --- | --- |
| AI订阅优惠 | 9 |
| VPS及云服务 | 9 |
| 海外银行 | 4 |
| 软件与数字服务 | 3 |
| U卡 | 2 |
| Crypto | 1 |
| 其他 | 0 |

紧接着又触发了一次同一个 Cron。结果是新增 0、更新 28、归档 0。同一条优惠没有变成第二行。

官方页面只在预设句子真的出现在抓到的 HTML 里才入库。GitHub Student Developer Pack 最多保留 6 条页面上以 “Offer $…” 开头的原文，这次只匹配到 1 条。

### 探过但没有当作种子的地址

这些地址在同一次调查里请求过，不进入定时采集：

| URL | 结果 | 原因 |
| --- | --- | --- |
| https://www.anthropic.com/news/rss.xml | 404 | 新闻室没有这个 RSS。改用上面的 HTML 新闻页，并且只匹配写明折扣的那一句 |
| https://www.binance.com/en/feed 与 `/en/support/announcement/rss` | 202，正文为空 | 没有可解析的公告 |
| https://www.coinbase.com/blog/rss | 403 | 拒绝访问 |
| https://www.revolut.com/ | 403 | 拒绝访问 |
| https://www.oracle.com/cloud/free/ | 403 | 拒绝访问 |
| https://wise.com/us/card/ 与 https://wise.com/gb/card/ | HTTP 200，正文是站内 404 | 不能当成优惠页 |
| https://wise.com/us/ | 200 | 只有费率计算器样例和营销句，没有可单独引用的优惠额度，未入库 |
| https://aws.amazon.com/free/ | 200 | 可见文本没有具体免费额度。定时任务改用 What's New RSS，这一轮也没有优惠句 |
| https://www.okx.com/fees | 200 后跳到费用表 | 费用表不是促销，未入库 |

没有使用需要登录的页面，也没有使用付费 API 或 API key。

## 本地运行

需要 Node.js 22+。

```bash
npm install
cp .dev.vars.example .dev.vars
# 把 ADMIN_TOKEN 换成一段长随机字符串。不要提交 .dev.vars。
npm run migrate:local
npm run dev
```

开发服务器在 <http://127.0.0.1:43117> 。`npm run dev` 等价于：

```bash
npx wrangler dev --local --ip 0.0.0.0 --port 43117 --test-scheduled --show-interactive-dev-session=false
```

`--local` 使用本机 D1，不会碰远程库。本地 Cron 不会自己按钟点跑。要手动触发和线上一样的定时处理器：

```bash
curl "http://127.0.0.1:43117/cdn-cgi/local/scheduled?cron=0+%2A%2F2+%2A+%2A+%2A"
```

手动采集（会再抓一遍外网）：

```bash
curl -X POST http://127.0.0.1:43117/api/admin/collect \
  -H "Authorization: Bearer <你的 ADMIN_TOKEN>"
```

错误令牌返回 401，GET 该路径返回 405。没配置令牌时返回 503。

本地数据库文件在 `.wrangler/state/`，已忽略。想清空重来就删掉这个目录，再执行 `npm run migrate:local`。

## 测试

```bash
npm test
```

使用 Node 自带测试运行器，经 `tsx` 执行 `test/**/*.test.ts`。覆盖去重与跟踪参数、联盟/邀请链接丢弃、截止日期提取、过期判断、排序、空字段显示为「待核实」、页面原文消失后的归档计划，以及 `ADMIN_TOKEN` 门禁。

本次在仓库里执行 `npm test`，退出码 **0**，23 项通过。类型检查是 `npm run typecheck`（先要有 `worker-configuration.d.ts`，已提交；改绑定后重新 `npm run types`）。

## 以后如何部署

还没有部署，也不要在没核对 `database_id` 之前部署。目标是所有者账号下新建的 `dealhunter`，地址会是 `https://dealhunter.<你的子域>.workers.dev`。不要部署或修改名为 `newsdesk` 的 Worker。

1. `npx wrangler login`，确认 `npx wrangler whoami` 是你自己的账号。
2. `npx wrangler d1 create dealhunter`。命令会打印 `database_id`。
3. 用那个 id 替换 `wrangler.jsonc` 里的占位符 `00000000-0000-4000-8000-0000000000d1`。不要保留占位符部署。
4. `npx wrangler d1 migrations apply dealhunter --remote`
5. `npx wrangler secret put ADMIN_TOKEN`，在提示符里输入令牌。不要把令牌写进命令行参数、`wrangler.jsonc` 或 git。
6. `npx wrangler deploy`

`wrangler secret put` 会创建并部署一个新版本。先完成第 3 步和第 4 步，再放令牌。

部署后看 `https://dealhunter.<子域>.workers.dev/` 。定时任务要等 Cloudflare 的 Cron，本地那种 `/cdn-cgi/local/scheduled` 只存在于 `wrangler dev`。

### 免费额度

按 Cloudflare 文档（Workers Limits、Workers Pricing、D1 Pricing；D1 免费档每日读写限制已在执行）：

| 项目 | Workers Free |
| --- | --- |
| 请求 | 每天 10 万次，UTC 零点重置 |
| CPU | 每次 HTTP 请求和每次 Cron 10ms。等待网络不算 CPU。本地 `wrangler dev` 不强制这个上限 |
| 外部子请求 | 每次调用 50 次。本采集大约 31 次直连，没有预留多少次重定向 |
| Cron | 每个账号最多 5 条。这里只用 1 条 |
| D1 读取 | 每天 500 万行 |
| D1 写入 | 每天 10 万行 |
| D1 存储 | 账号合计 5 GB |
| D1 数据库个数 | 10 |

每 2 小时跑一次，大约每天 12 次 Cron。单次大约 8 秒墙钟（这次本地测量），远低于 Cron 15 分钟墙钟上限。真正要担心的是免费档 10ms CPU：本地开发不模拟这个限制，所以不能声称线上 Cron 一定跑得完。如果线上出现 Error 1102，先减少 `src/sources.ts` 里的种子，而不是升配。本项目不使用付费功能。

## 如何回滚

- Worker 代码：`npx wrangler deployments list` 看版本，然后 `npx wrangler rollback`。这只回滚 Worker 脚本，不回滚 D1 里的行，也不取消已经发出的 Cron。
- 想停采集：从 `wrangler.jsonc` 去掉 `triggers.crons` 后再部署。已经写进 D1 的优惠还在。
- 错误迁移：不要改已经应用过的 `migrations/*.sql`。新写一条迁移修正。远程迁移应用过之后，本地和远程的迁移记录是分开的。
- 占位 `database_id` 如果被误拿去部署，会指向一个不存在或错误的库。部署前必须换成 `wrangler d1 create` 打印的 id。

## 没有自动化、或做不到的事

对应原始需求第七部分。下面这些都没有假装完成：

- 没有接入大模型。分类、金额、日期、优惠类型全是规则和正则。判断不了的就空着或标「待核实」。
- 不能登录交易所、银行、厂商后台，也不能绕过 403。Binance、Coinbase、Revolut、Oracle Cloud 免费页这次打不开，所以没有它们的条目。
- 不渲染需要执行 JavaScript 才出现的正文。首屏 HTML 里没有的句子不会被收录。
- 不把「30 天」「90 天」「限时」换算成日历截止日，所以这些条目不会进入「即将截止」，也不会因为时间过去而自动归档。
- RSS 滚出最近 15 条，不代表活动结束，因此不会自动归档。只有写明的截止日过了，或官方页面的原句消失了，才进档案。
- 参与步骤几乎总是「待核实」。来源没有给出步骤列表时，不会编「打开网站、注册、完成任务」。
- 不同货币不换算。百分比折扣没有基准价时，不会估一个美元价值。排序因此是粗排，不是估价。
- 不做推送、邮件、Telegram、Slack。这些需要另外的连接器和权限。
- 不验证你能不能真正参加。它只复述抓到的原文，并在金融类条目上加固定风险提示。
- 不包含联盟链接、邀请链接或推荐码。
- 这次没有部署，也没有创建远程 D1。线上 Cron、免费档 CPU 限制、`*.workers.dev` 地址都还没有实测。

## 中文翻译（2026-11-10 新增，待上线）

- 页面右上方有「中文 / EN 原文」切换，默认中文。没有译文的条目一律显示英文原文。选择会存进浏览器 localStorage，也可用 `?lang=en` 直接打开英文。
- 译文存进 D1 新列（`migrations/0002_translation.sql`）：`zh_title`、`zh_summary`、`zh_status`（done / skip / error）、`zh_engine`、`zh_at`、`zh_attempts`。请求时不翻译。
- 引擎：Workers AI `@cf/meta/m2m100-1.2b`，通过 `AI` 绑定调用（`src/translate.ts`）。
- 单独的 Cron `30 */2 * * *`（采集之后 30 分钟）只做翻译，不和采集共用一次调用的 CPU。也可 `POST /api/admin/translate`（同一个 ADMIN_TOKEN）手动补一批。
- 只翻新条目：`zh_status IS NULL` 的活跃行，每批默认 6 行，每天（UTC）默认最多 80 行，单段最多 480 字符。环境变量 `TRANSLATE_BATCH` / `TRANSLATE_DAILY_MAX` / `TRANSLATE_MAX_CHARS` 可调，但代码里有硬上限 12 / 150 / 600。已是中文的行标 skip，不调用模型。
- 英文原文变了，旧译文自动清空并重新排队；没变就保留。失败最多重试 3 次。模型报错（比如免费额度用完）就停这一批。
- 关闭翻译：把 `TRANSLATE_ENABLED` 设成 `0`，或去掉 `ai` 绑定。页面自动退回原文。
- 本地开发没有 AI（AI 绑定只能走远程）：用 `wrangler.local.jsonc`（同配置、去掉 ai）跑 `wrangler dev -c wrangler.local.jsonc`，翻译 Cron 会返回 `no_ai_binding`。
- 一键上线：`npx wrangler deploy --dry-run --outdir dist && node deploy/build-translate-deploy.cjs`，再把 `deploy/translate-deploy.js` 交给 Cloudflare 连接器 execute 执行（迁移 0002、上传 Worker 并保留 ADMIN_TOKEN、两个 Cron）。
