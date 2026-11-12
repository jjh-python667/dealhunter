/**
 * Styles for the shareable deal detail page. Loaded after PAGE_CSS and NAV_CSS,
 * so every rule here may safely build on the design tokens they define.
 * All classes are detail-scoped (or unique to this page) to avoid fighting the
 * discovery board; the layout is single-column and never relies on fixed widths,
 * so 390px phones wrap instead of scrolling sideways.
 */
export const DETAIL_CSS = String.raw`
.detail-page{max-width:1120px;margin:0 auto;padding:26px 36px 60px;min-width:0;overflow-wrap:anywhere}
.breadcrumb{display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:12px;color:var(--muted);padding:2px 0}
.breadcrumb a{color:#b9c6d2}
.breadcrumb a:hover{color:var(--gold)}
.breadcrumb .sep{color:#5a6a78}
.breadcrumb [aria-current="page"]{color:var(--gold)}
.detail-page .preview-label{margin:10px 0 0;color:var(--gold);font-size:11px}

.archive-banner{margin:16px 0 0;padding:13px 16px;border:1px solid #e9bd7640;border-left:3px solid var(--gold);border-radius:12px;background:#e9bd760d}
.archive-banner strong{display:block;margin:0 0 4px;color:var(--gold);font-size:13px}
.archive-banner p{margin:0;color:#cbb98f;font-size:12px;line-height:1.75}
.archive-banner .archive-note{margin-top:4px;color:var(--muted)}
.archive-banner a{color:var(--gold);text-decoration:underline;text-underline-offset:3px}

.detail-hero{display:grid;gap:18px;padding:20px 0 4px;min-width:0}
.detail-head{display:grid;gap:12px;min-width:0}
.detail-chips{display:flex;flex-wrap:wrap;align-items:center;gap:7px;min-width:0}
.deal-status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #e9bd7652;border-radius:999px;background:#e9bd7614;color:var(--gold);font-size:11px;letter-spacing:.02em}
.deal-status:before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.deal-status[data-status="ended"]{border-color:#9baab952;background:#9baab90f;color:#c3cfd9}
.deal-status[data-status="archived"]{border-color:#8b7f6a52;background:#8b7f6a0f;color:#b9b0a0}
.detail-chip{padding:4px 9px;border:1px solid var(--line);border-radius:6px;background:#111b25;color:#c3d0db;font-size:11px}
.detail-chip.source{color:var(--muted);overflow-wrap:anywhere}
.detail-title{margin:0;font-size:clamp(23px,3.1vw,38px);line-height:1.3;letter-spacing:-.03em;font-weight:700;overflow-wrap:anywhere}
.detail-title .t-zh,.detail-title .t-en{display:block}
.detail-title .t-en{color:#c3d0db;font-weight:600;font-size:.72em;line-height:1.45}

.detail-vitals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;min-inline-size:0}
.vital{min-width:0;padding:13px 15px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(150deg,#14202a,#101922)}
.vital dt{margin:0 0 5px;color:#7f92a4;font-size:10px;letter-spacing:.08em}
.vital dd{margin:0;color:#dbe5ed;font-size:13px;line-height:1.65;overflow-wrap:anywhere}
.vital .vital-sub{margin-top:6px;color:var(--muted);font-size:11px}
.vital .vital-sub span{margin-right:6px;color:#7f92a4}
.detail-value{font:600 clamp(20px,2.4vw,27px)/1.35 ui-monospace,monospace;color:var(--gold);letter-spacing:-.03em}
.detail-value .t-zh,.detail-value .t-en{display:block}
.detail-value .t-en{font-size:.62em;color:#cbb98f;letter-spacing:0}
.deadline-state{display:inline-block;margin-left:7px;padding:1px 7px;border-radius:5px;background:#9baab914;color:#b9c6d2;font-size:10px;vertical-align:2px}
.vital-official{grid-column:1/-1}
.vital-official dd,.official-row{display:grid;gap:6px;justify-items:start}
.official-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:10px 20px;border-radius:10px;background:linear-gradient(145deg,#f0c883,#d9a95c);color:#151006;font-size:14px;font-weight:650;letter-spacing:.01em}
.official-cta:hover{filter:brightness(1.06);text-decoration:none}
.official-cta svg{width:16px;height:16px}
.official-disabled{display:inline-flex;align-items:center;min-height:46px;padding:10px 18px;border:1px dashed #55636f;border-radius:10px;background:#0d161e;color:var(--muted);font-size:13px;cursor:default}
.official-note{margin:0;color:var(--muted);font-size:11px;line-height:1.7}

.detail-actions{display:flex;flex-wrap:wrap;gap:9px}
.detail-action{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:9px 15px;border:1px solid var(--line);border-radius:9px;background:#111b25;color:#d5e0e8;font-size:12px;transition:border-color var(--quick),background var(--quick),color var(--quick)}
.detail-action:hover{border-color:#566675;background:#16222d;color:var(--gold);text-decoration:none}
.detail-action svg{width:16px;height:16px}
.detail-actions .bookmark{margin-left:0}
.detail-action[aria-pressed="true"]{border-color:#e9bd7652;background:#e9bd760f;color:var(--gold)}
.detail-action[aria-pressed="true"] svg{fill:#e9bd762e}

.detail-section{margin-top:32px;padding-top:22px;border-top:1px solid var(--line);min-width:0}
.detail-section>h2{font-size:19px;letter-spacing:-.02em;margin:0 0 13px}
.section-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin:0 0 13px}
.section-head h2{font-size:19px;letter-spacing:-.02em;margin:0}
.section-head p{margin:0;color:var(--muted);font-size:11px}
.detail-dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}
.detail-dl>div{min-width:0;padding:11px 13px;border:1px solid var(--line);border-radius:11px;background:#0f1922}
.detail-dl dt{margin:0 0 4px;color:#7f92a4;font-size:10px;letter-spacing:.05em}
.detail-dl dd{margin:0;color:#d5e0e8;font-size:12.5px;line-height:1.65;overflow-wrap:anywhere;white-space:normal}
.detail-dl dd .evidence-quote{margin-top:5px;font-size:11px;line-height:1.6}
.steps-text{margin:0;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:#0f1922;color:#d5e0e8;font-size:13px;line-height:1.9;white-space:pre-line;overflow-wrap:anywhere}
.pending-block{display:inline-flex;align-items:center;gap:8px;margin:0 0 8px;padding:8px 13px;border:1px dashed #55636f;border-radius:9px;background:#0d161e;color:var(--muted);font-size:13px}
.section-note{margin:10px 0 0;color:var(--muted);font-size:11px;line-height:1.75}
.source-excerpt{margin:0 0 14px;padding:12px 16px;border-left:2px solid var(--gold);border-radius:0 10px 10px 0;background:#e9bd7608;color:#d7e2ea;font-size:13px;line-height:1.8;overflow-wrap:anywhere}
.source-excerpt p{margin:0;white-space:pre-line}
.excerpt-translation{margin:-4px 0 14px;color:#b5a8d3;font-size:12px;line-height:1.75}
.evidence-list dd .source-link{max-width:none;white-space:normal;overflow-wrap:anywhere}
.evidence-list dd .source-link svg{width:13px;height:13px;margin-right:4px}
.official-link{overflow-wrap:anywhere;word-break:break-all}
.evidence-list dd.risk-inline{color:#e2b8b4}

.detail-footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 18px;margin-top:36px;padding-top:18px;border-top:1px solid var(--line);color:#7e91a3;font-size:11px}
.detail-footer p{margin:0}
.detail-footer a{color:#afc3d1}
.detail-footer a:hover{color:var(--gold)}
.detail-page .noscript{margin:18px 0 0}

@media(hover:hover){.vital:hover{border-color:#3b4a58}}
@media(prefers-reduced-motion:no-preference){.detail-hero{animation:detail-in 320ms var(--ease) both}}
@media(max-width:900px){.detail-page{padding:20px 24px 46px}}
@media(max-width:600px){
  .detail-page{padding:16px 16px 42px}
  .detail-title{font-size:23px}
  .detail-vitals{grid-template-columns:minmax(0,1fr)}
  .detail-dl{grid-template-columns:minmax(0,1fr)}
  .vital-official{grid-column:auto}
  .official-cta{width:100%}
  .detail-action{flex:1 1 calc(50% - 5px);justify-content:center}
  .section-head{display:block}
  .section-head p{margin-top:4px}
  .detail-footer{flex-direction:column}
}
@media(max-width:380px){
  .detail-page{padding-left:13px;padding-right:13px}
  .detail-title{font-size:21px}
  .vital{padding:11px 12px}
  .detail-action{flex:1 1 100%}
}
@media(prefers-reduced-motion:reduce){.detail-hero{animation:none}}
`;
