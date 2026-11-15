// Builds deploy/translate-deploy.js for the Cloudflare connector "execute" tool.
// One call: apply migration 0002 to remote D1 (idempotent), upload the Worker with
// the AI binding (ADMIN_TOKEN kept via keep_bindings), and set both cron triggers.
// Usage: npx wrangler deploy --dry-run --outdir dist && node deploy/build-translate-deploy.cjs
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(root, "dist/index.js"), "utf8").replace(/\n\/\/# sourceMappingURL=.*$/, "");
const mig = fs.readFileSync(path.join(root, "migrations/0002_translation.sql"), "utf8");
const AID = "df11732e5f8bb48f67ab4cfa8f604450";
const DB = "1e887a64-783e-410e-9faf-47cd4ecef9a2";
const code = `async () => {
  const aid = ${JSON.stringify(AID)}, db = ${JSON.stringify(DB)};
  const q = (sql) => cloudflare.request({ method: "POST", path: \`/accounts/\${aid}/d1/database/\${db}/query\`, body: { sql } });
  const applied = await q("SELECT name FROM d1_migrations WHERE name = '0002_translation.sql'");
  let migrated = "already";
  if (!applied.result[0].results.length) {
    await q(${JSON.stringify(mig)} + "\\nINSERT INTO d1_migrations(name) VALUES ('0002_translation.sql');");
    migrated = "applied";
  }
  const metadata = {
    main_module: "index.js", compatibility_date: "2026-11-10", compatibility_flags: ["nodejs_compat"],
    bindings: [
      { type: "d1", name: "DB", id: db },
      { type: "ai", name: "AI" },
      { type: "plain_text", name: "TRANSLATE_ENABLED", text: "1" },
      { type: "plain_text", name: "TRANSLATE_BATCH", text: "6" },
      { type: "plain_text", name: "TRANSLATE_DAILY_MAX", text: "80" },
    ],
    keep_bindings: ["secret_text"],
    observability: { enabled: true, head_sampling_rate: 1, logs: { enabled: true, invocation_logs: true, head_sampling_rate: 1 } },
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("index.js", new Blob([${JSON.stringify(js)}], { type: "application/javascript+module" }), "index.js");
  const up = await cloudflare.request({ method: "PUT", path: \`/accounts/\${aid}/workers/scripts/dealhunter\`, body: form });
  const sch = await cloudflare.request({ method: "PUT", path: \`/accounts/\${aid}/workers/scripts/dealhunter/schedules\`, body: [{ cron: "0 */2 * * *" }, { cron: "30 */2 * * *" }] });
  return { migrated, etag: up.result.etag, deployment: up.result.deployment_id, schedules: sch.result.schedules.map((s) => s.cron) };
}`;
fs.writeFileSync(path.join(__dirname, "translate-deploy.js"), code);
console.log("wrote deploy/translate-deploy.js", code.length, "bytes");
