/**
 * Portal homepage styles. Dark background + warm gold, matching PAGE_CSS tokens.
 * Everything here is a function of the container width: no fixed widths that can
 * push the page sideways at 390px, and the desktop layout is capped at 1320px.
 */
export const HOME_CSS = String.raw`
.recommendation-list{margin:0;padding:0;list-style:none;counter-reset:recommendation;border:1px solid var(--line);border-radius:14px;background:var(--panel)}
.recommendation-list li{counter-increment:recommendation;display:grid;grid-template-columns:2ch minmax(0,1fr) minmax(0,30%);gap:12px;align-items:center;padding:12px 16px;overflow-wrap:anywhere}
.recommendation-list li+li{border-top:1px solid var(--line)}
.recommendation-list li::before{content:counter(recommendation,decimal-leading-zero);font:600 13px ui-monospace,monospace;color:var(--gold)}
.recommendation-list .portal-value{text-align:right}
@media(max-width:480px){.recommendation-list li{grid-template-columns:2ch minmax(0,1fr);gap:5px 10px;padding:10px 12px}.recommendation-list .portal-value{grid-column:2;text-align:left}}
.portal{max-width:1320px;margin:0 auto;padding:28px 36px 56px;min-width:0}
.portal-hero{position:relative;isolation:isolate;overflow:hidden;border:1px solid #2e3b47;border-radius:24px;padding:clamp(26px,4.2vw,56px) clamp(22px,4vw,54px) clamp(22px,3vw,38px);background:radial-gradient(ellipse 640px 340px at 88% -8%,#e9bd7626,transparent 68%),radial-gradient(ellipse 460px 300px at 2% 108%,#8dd4c810,transparent 70%),linear-gradient(158deg,#16212c 0%,#0e1720 58%,#0a1119 100%);box-shadow:0 26px 60px #00000033,inset 0 1px #ffffff14}
.portal-hero:before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(#ffffff06 1px,transparent 1px),linear-gradient(90deg,#ffffff06 1px,transparent 1px);background-size:58px 58px;-webkit-mask-image:radial-gradient(ellipse 72% 78% at 62% 0%,#000 0%,transparent 76%);mask-image:radial-gradient(ellipse 72% 78% at 62% 0%,#000 0%,transparent 76%);opacity:.5}
.portal-hero-inner{display:grid;grid-template-columns:minmax(0,1.32fr) minmax(258px,.68fr);grid-template-areas:"copy stats" "search search";gap:clamp(20px,2.8vw,36px) clamp(24px,3.4vw,52px);align-items:start}
.portal-hero-copy{grid-area:copy;min-width:0}
.portal-hero-side{grid-area:stats;min-width:0;align-self:center;display:flex;flex-direction:column;gap:10px}
.portal-hero h1{font-size:clamp(33px,5.2vw,62px);line-height:1.03;letter-spacing:-.05em;margin:0 0 16px;font-weight:750;max-width:14ch;text-wrap:balance;color:var(--ink)}
@supports((-webkit-background-clip:text) or (background-clip:text)){.portal-hero h1{background:linear-gradient(178deg,#fdfbf6 0%,#efe4cd 52%,#cdb488 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}}
.portal-hero .eyebrow{margin-bottom:clamp(12px,1.6vw,20px)}
.portal-lede{margin:0 0 20px;max-width:56ch;color:#b6c4d1;font-size:clamp(13.5px,1.2vw,16px);line-height:1.78}
.portal-quick{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 22px}
.portal-chip{display:inline-flex;align-items:center;min-height:38px;padding:6px 14px;border:1px solid #34424f;border-radius:999px;background:#ffffff06;color:#c2cfda;font-size:12px;letter-spacing:.01em;transition:color var(--quick),border-color var(--quick),background var(--quick)}
.portal-search{grid-area:search;display:flex;align-items:center;gap:10px;min-height:62px;padding:6px 6px 6px 16px;border:1px solid #37444f;border-radius:14px;background:#0a121a;box-shadow:0 12px 30px #0000002b;transition:border-color var(--quick),box-shadow var(--quick)}
.portal-search:focus-within{border-color:#c39c58;box-shadow:0 0 0 3px #e9bd7620,0 12px 30px #0000002b}
.portal-search>svg{width:19px;height:19px;color:var(--gold)}
.portal-search input{flex:1 1 auto;min-width:0;min-height:48px;border:0;outline:0;background:transparent;color:var(--ink);font-size:15px}
.portal-search input:focus-visible{outline:0}
.portal-search button{display:inline-flex;align-items:center;gap:7px;min-height:48px;padding:0 22px;border:0;border-radius:10px;background:linear-gradient(160deg,#efc982,#d8ab60);color:#221a0c;font-size:14px;font-weight:650;letter-spacing:.01em;white-space:nowrap}
.portal-search button svg{width:15px;height:15px;stroke-width:2}
.portal-stats{margin:0;padding:2px 18px;border:1px solid #2d3a46;border-radius:16px;background:#0a121a99;display:grid;gap:0}
.portal-stat{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #ffffff0b;min-width:0}
.portal-stat:first-child{border-top:0}
.portal-stat dt{font-size:11px;color:var(--muted);letter-spacing:.04em}
.portal-stat dd{margin:0;display:flex;align-items:baseline;gap:6px;min-width:0}
.portal-stat strong{font:600 clamp(24px,2.4vw,32px)/1.15 ui-monospace,SFMono-Regular,monospace;letter-spacing:-.05em;color:var(--gold)}
.portal-stat em{font-style:normal;font-size:11px;color:#8294a6}
.portal-snapshot{margin:0;font-size:11px;line-height:1.7;color:#8294a6;text-align:right}
.portal-section{padding-top:clamp(38px,4.8vw,68px);min-width:0;scroll-margin-top:84px}
.portal-section-head{display:flex;align-items:flex-end;gap:10px 18px;flex-wrap:wrap;margin:0 0 clamp(16px,2.2vw,24px)}
.portal-kicker{margin:0 0 8px;display:flex;align-items:center;gap:10px;font:10px/1.5 ui-monospace,SFMono-Regular,monospace;letter-spacing:.2em;color:#8b9cad}
.portal-kicker b{font-weight:600;color:var(--gold)}
.portal-kicker:after{content:"";width:26px;height:1px;background:linear-gradient(90deg,#e9bd7666,transparent)}
.portal-section h2{font-size:clamp(21px,2.5vw,31px);line-height:1.22;letter-spacing:-.03em;margin:0;font-weight:700;color:var(--ink)}
.portal-section-note{margin:6px 0 0;max-width:54ch;color:var(--muted);font-size:12.5px;line-height:1.7}
.portal-section-link{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;color:var(--gold);font-size:12.5px;white-space:nowrap}
.portal-section-link svg{width:14px;height:14px}
.portal-section-head:after{content:"";flex-basis:100%;height:1px;background:linear-gradient(90deg,#2c3945,#2c394500 74%);margin-top:4px}
.portal-value{font:600 20px/1.35 ui-monospace,SFMono-Regular,monospace;letter-spacing:-.04em;color:var(--gold);overflow-wrap:anywhere}
.portal-more{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:10px 18px;border:1px solid #bd98547a;border-radius:11px;background:linear-gradient(160deg,#e9bd7626,#e9bd760d);color:var(--gold);font-size:13px;font-weight:600;transition:background var(--quick),border-color var(--quick)}
.portal-more svg{width:14px;height:14px}
.portal-cta{display:inline-flex;align-items:center;gap:6px;min-height:40px;color:var(--gold);font-size:12.5px}
.portal-cta svg{width:13px;height:13px}
.section-empty{margin:0;padding:clamp(22px,3vw,34px) clamp(18px,3vw,28px);border:1px dashed #344554;border-radius:16px;background:#0e172080;color:var(--muted);font-size:13px;line-height:1.85}
.featured-primary{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.22fr) minmax(272px,.78fr);gap:clamp(20px,3vw,40px);padding:clamp(22px,2.8vw,36px);border:1px solid #3a4855;border-radius:22px;background:radial-gradient(ellipse 520px 260px at 100% 0%,#e9bd761f,transparent 70%),linear-gradient(150deg,#19232e,#0e1720 72%);box-shadow:0 20px 48px #00000030,inset 0 1px #ffffff10}
.featured-primary:before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,#e9bd76 45%,transparent);opacity:.85}
.featured-body{min-width:0;display:flex;flex-direction:column}
.featured-flag{margin:0 0 14px;display:inline-flex;align-items:center;gap:8px;color:var(--gold);font:10px/1.5 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em}
.featured-flag svg{width:14px;height:14px}
.featured-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}
.portal-cat{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--cat,var(--cyan))}
.portal-cat:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--cat,var(--cyan));box-shadow:0 0 0 3px #ffffff08}
.featured-title{margin:0 0 12px;font-size:clamp(22px,2.5vw,32px);line-height:1.3;letter-spacing:-.025em;font-weight:700;overflow-wrap:anywhere}
.featured-title-link{color:var(--ink)}
.featured-excerpt{margin:0 0 18px;max-width:62ch;color:#aebdcb;font-size:13.5px;line-height:1.8;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.featured-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:0 0 20px;font-size:11px;color:#8598a9;min-width:0}
.featured-meta .source-link{max-width:100%}
.featured-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:auto}
.featured-actions .bookmark{margin-left:0}
.featured-aside{min-width:0;margin:0;padding:2px 18px;border:1px solid #ffffff12;border-radius:16px;background:#0a121980;display:grid;gap:0;align-content:start}
.featured-fact{padding:13px 0;border-top:1px solid #ffffff0a;min-width:0}
.featured-fact:first-child{border-top:0}
.featured-fact dt{font-size:10px;letter-spacing:.1em;color:#7f92a4;margin:0 0 5px}
.featured-fact dd{margin:0;color:#d6e0e8;font-size:13px;line-height:1.65;overflow-wrap:anywhere}
.featured-fact dd.portal-value{font-size:clamp(23px,2.5vw,32px)}
.featured-secondary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px}
.featured-secondary-card{min-width:0;display:flex;flex-direction:column;padding:17px 17px 4px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(160deg,#131d27,#0f1821);transition:border-color var(--normal),transform var(--normal),box-shadow var(--normal)}
.portal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.portal-card{position:relative;min-width:0;display:flex;flex-direction:column;padding:16px 17px 4px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(160deg,#131d27,#0f1821);transition:border-color var(--normal),transform var(--normal),box-shadow var(--normal)}
.portal-card[data-category="ai"],.featured-secondary-card[data-category="ai"]{--cat:#b8a6ed}
.portal-card[data-category="vps"],.featured-secondary-card[data-category="vps"]{--cat:#8dc1e6}
.portal-card[data-category="software"],.featured-secondary-card[data-category="software"]{--cat:#8dd4c8}
.portal-card[data-category="crypto"],.featured-secondary-card[data-category="crypto"]{--cat:#e9bd76}
.portal-card[data-category="bank"],.portal-card[data-category="ucard"],.featured-secondary-card[data-category="bank"],.featured-secondary-card[data-category="ucard"]{--cat:#c5b5d9}
.portal-card-top{display:flex;align-items:center;gap:8px;min-height:32px;margin:0 0 9px}
.portal-card-title{margin:0 0 8px;font-size:16.5px;line-height:1.45;letter-spacing:-.015em;font-weight:650;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.portal-card-title a{color:var(--ink)}
.portal-excerpt{margin:0 0 12px;color:#a8b8c7;font-size:12.5px;line-height:1.75;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.portal-reason{margin:0 0 8px;color:var(--gold);font-size:11px;line-height:1.6}
.portal-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:46px;margin-top:auto;padding:9px 0;border-top:1px solid #ffffff0a}
.portal-card-foot .portal-value{font-size:16px}
.portal-card-when{font-size:11px;color:#8294a6;white-space:nowrap;flex-shrink:0}
.portal-card-when time{color:#93a6b7}
.portal-card .bookmark,.featured-secondary-card .bookmark{margin-left:auto}
.ending-panel{border:1px solid var(--line);border-radius:18px;background:linear-gradient(160deg,#111b24,#0d151d);overflow:hidden}
.ending-list{list-style:none;margin:0;padding:0}
.ending-list li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 18px;padding:14px 20px;border-top:1px solid #ffffff0a}
.ending-list li:first-child{border-top:0}
.ending-main{display:flex;flex-direction:column;gap:3px;min-width:0}
.ending-title{color:var(--ink);font-size:14.5px;font-weight:600;line-height:1.45;overflow-wrap:anywhere}
.ending-sub{font-size:11.5px;color:#8294a6;overflow-wrap:anywhere}
.ending-sub time{color:#9db0c0}
.ending-days{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:4px 12px;border:1px solid #e9bd7640;border-radius:999px;background:#e9bd7612;color:var(--gold);font:11px/1.4 ui-monospace,SFMono-Regular,monospace;white-space:nowrap}
.ending-days.hot{border-color:#eaa4a04d;background:#eaa4a014;color:var(--rose)}
.for-you-empty{padding:clamp(28px,4vw,46px) clamp(20px,3vw,32px);border:1px dashed #3a4a58;border-radius:18px;background:#0e172080;text-align:center}
.for-you-empty-icon{display:grid;place-items:center;width:48px;height:48px;margin:0 auto 15px;border:1px solid var(--line);border-radius:14px;background:#15222d;color:var(--gold)}
.for-you-empty h3{font-size:17px;line-height:1.4;margin:0 0 7px}
.for-you-empty p{max-width:430px;margin:0 auto 18px;color:var(--muted);font-size:13px;line-height:1.8}
.portal-footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:22px 40px;align-items:flex-start;margin-top:clamp(44px,5.4vw,76px);padding-top:26px;border-top:1px solid var(--line)}
.portal-foot-brand{min-width:0;max-width:44ch}
.portal-foot-brand strong{display:block;font-size:15px;letter-spacing:.01em}
.portal-foot-brand small{display:block;margin:2px 0 9px;font:10px/1.6 ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em;color:var(--muted)}
.portal-foot-brand p{margin:0;color:var(--muted);font-size:12px;line-height:1.8}
.portal-foot-links{display:grid;grid-template-columns:repeat(2,minmax(0,auto));gap:0 34px;min-width:0}
.portal-foot-links a{display:inline-flex;align-items:center;gap:6px;min-height:40px;color:#b9c6d2;font-size:12.5px}
.portal-foot-links a svg{width:12px;height:12px;color:#6f8496}
.portal-noscript{margin:0 0 18px}
@media(hover:hover){
  .portal-chip:hover{color:var(--gold);border-color:#bd98545c;background:#e9bd7612;text-decoration:none}
  .portal-search button:hover{filter:brightness(1.06)}
  .portal-more:hover{background:#e9bd762e;border-color:#d3a75c;text-decoration:none}
  .portal-cta:hover,.portal-section-link:hover,.portal-foot-links a:hover{color:#f3d4a0;text-decoration:none}
  .portal-card:hover,.featured-secondary-card:hover{border-color:#a98b534d;box-shadow:0 12px 28px #00000029;transform:translateY(-2px)}
  .featured-primary:hover{border-color:#4b5a68}
  .featured-title-link:hover,.portal-card-title a:hover{color:#f6d9a6;text-decoration:none}
  .ending-title:hover{color:var(--gold)}
}
@media(prefers-reduced-motion:no-preference){
  .portal-hero h1{animation:title-opening 860ms cubic-bezier(.16,1,.3,1) both}
  .portal-hero .eyebrow,.portal-lede,.portal-quick,.portal-search,.portal-stats{animation:panel-opening 640ms cubic-bezier(.16,1,.3,1) both}
  .portal-lede{animation-delay:90ms}
  .portal-quick{animation-delay:150ms}
  .portal-stats{animation-delay:130ms}
  .portal-search{animation-delay:210ms}
  .featured-primary{animation:card-reveal 560ms cubic-bezier(.16,1,.3,1) both}
  .featured-secondary-card.enter{animation:card-reveal 460ms cubic-bezier(.16,1,.3,1) var(--delay,0ms) both}
}
@media(prefers-reduced-motion:reduce){
  .portal-hero h1,.portal-hero .eyebrow,.portal-lede,.portal-quick,.portal-search,.portal-stats,.featured-primary,.featured-secondary-card,.portal-card{animation:none!important;transform:none!important;clip-path:none!important}
  .portal-hero:before{opacity:.32}
}
@media(max-width:1100px){
  .portal{padding:24px 24px 44px}
  .portal-hero-inner{grid-template-columns:minmax(0,1fr);grid-template-areas:"copy" "stats" "search"}
  .portal-hero-side{align-self:start}
  .portal-stats{grid-template-columns:repeat(3,minmax(0,1fr));padding:12px 6px;gap:4px}
  .portal-stat{flex-direction:column;align-items:flex-start;gap:2px;padding:0 14px;border-top:0;border-left:1px solid #ffffff0b}
  .portal-stat:first-child{border-left:0}
  .portal-snapshot{text-align:left}
  .featured-primary{grid-template-columns:minmax(0,1fr)}
  .featured-aside{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px}
  .featured-fact{padding:12px 0}
  .featured-fact:nth-child(2){border-top:0}
  .portal-grid,.featured-secondary{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:900px){
  .portal{padding:20px 20px 40px}
  .portal-section-head{gap:8px 14px}
  .portal-section-link{margin-left:0}
  .portal-section-head:after{margin-top:2px}
  .portal-foot-links{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:720px){
  .portal{padding:16px 16px 34px}
  .portal-hero{border-radius:19px}
  .portal-hero h1{max-width:none}
  .featured-aside{grid-template-columns:minmax(0,1fr);padding:2px 16px}
  .featured-fact:nth-child(2){border-top:1px solid #ffffff0a}
  .portal-search{padding:5px 5px 5px 13px;min-height:56px;gap:8px}
  .portal-search input{min-height:46px;font-size:14px}
  .portal-search button{min-height:46px;padding:0 16px}
  .portal-grid,.featured-secondary{grid-template-columns:minmax(0,1fr)}
  .portal-card-foot .portal-card-when{font-size:10.5px}
  .ending-list li{padding:13px 15px}
  .portal-foot-links{grid-template-columns:minmax(0,1fr)}
}
@media(max-width:420px){
  .portal{padding:12px 12px 30px}
  .portal-hero{padding:24px 18px 20px;border-radius:17px}
  .portal-hero h1{font-size:30px;margin-bottom:13px}
  .portal-lede{font-size:13px;margin-bottom:16px}
  .portal-quick{gap:6px;margin-bottom:18px}
  .portal-chip{min-height:36px;padding:5px 11px;font-size:11.5px}
  .portal-stat{padding:0 9px}
  .portal-stat strong{font-size:23px}
  .portal-stat dt,.portal-stat em{font-size:10px}
  .portal-search button{padding:0 13px}
  .portal-search button span{display:none}
  .ending-list li{grid-template-columns:minmax(0,1fr);gap:6px}
  .ending-days{justify-self:start}
}
`;
