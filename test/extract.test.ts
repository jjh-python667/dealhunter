import assert from "node:assert/strict";
import test from "node:test";
import {
  assessValue,
  classifyDealType,
  extractConditions,
  extractRegions,
  extractSteps,
  extractTime,
  isDealText,
  isEndingSoon,
  isExpired,
  rankScore,
  reconcilePlan,
  showSchedule,
} from "../src/extract";
import { riskNote, show } from "../src/labels";

test("deadline extraction uses explicit end cues only", () => {
  assert.equal(extractTime("Offer ends on December 31, 2026.").endsAt, "2026-12-31");
  const through = extractTime("available on AI Gateway for free through November 13, 2026.");
  assert.equal(through.endsAt, "2026-11-13");
  assert.match(through.timeText, /^through November 13, 2026/);
  assert.equal(extractTime("valid through Nov 15, 2026").endsAt, "2026-11-15");
  assert.equal(extractTime("截止至2026年12月31日").endsAt, "2026-12-31");
  assert.equal(extractTime("published 2026-10-01 in the blog").endsAt, null);
  const duration = extractTime("Start with a 30-day free trial");
  assert.equal(duration.endsAt, null);
  assert.match(duration.timeText, /30-day/);
  const limited = extractTime("free for a limited time");
  assert.equal(limited.endsAt, null);
  assert.match(limited.timeText, /limited time/);
});

test("start and end dates stay on their own cues", () => {
  const time = extractTime("from Jan 1, 2026 until Mar 1, 2026");
  assert.equal(time.startsAt, "2026-01-01");
  assert.equal(time.endsAt, "2026-03-01");
});

test("value stays inside the source excerpt", () => {
  const railway = "Start with a 30-day free trial with $5 credits, then $1 per month";
  const credit = assessValue(railway);
  assert.equal(credit.tier, "money");
  assert.equal(credit.amount, 5);
  assert.equal(credit.currency, "USD");
  assert.equal(railway.includes(credit.valueText), true);

  const gcp = "a $300 Welcome credit to spend over 90 days";
  const welcome = assessValue(gcp);
  assert.equal(welcome.amount, 300);
  assert.equal(gcp.includes(welcome.valueText), true);

  const ambiguous = "Bonus $20 or bonus $50 depending on the desk";
  const unclear = assessValue(ambiguous);
  assert.equal(unclear.tier, "unverified");
  assert.equal(unclear.amount, null);
  assert.equal(unclear.valueText, "");

  const missing = assessValue("A new model is available in the console");
  assert.equal(missing.tier, "unverified");
  assert.equal(show(missing.valueText), "待核实");

  const free = assessValue("$0 Free for everyone");
  assert.equal(free.tier, "qualitative");
  assert.equal(free.amount, null);

  const percent = assessValue("Up to 90% off the context your agents resend");
  assert.equal(percent.tier, "percent");
  assert.equal(percent.amount, null);
  assert.equal(percent.valueText.toLowerCase().includes("90%"), true);
});

test("待核实 display and schedule notes do not invent a calendar date", () => {
  assert.equal(show(""), "待核实");
  assert.equal(show("   "), "待核实");
  assert.equal(show("UK residents only"), "UK residents only");
  const shown = showSchedule({ startsAt: null, endsAt: null, timeText: "over 90 days" });
  assert.match(shown, /over 90 days/);
  assert.match(shown, /没有日历截止日/);
  assert.equal(showSchedule({ startsAt: null, endsAt: null, timeText: "" }), "待核实");
});

test("deal type distinguishes the five conditions and leaves mixtures unverified", () => {
  assert.equal(classifyDealType("Open a free Monzo account"), "free");
  assert.equal(classifyDealType("$0 Free for everyone. Limited usage every 5 hours"), "free");
  assert.equal(classifyDealType("30-day free trial with $5 credits"), "trial");
  assert.equal(classifyDealType("free for a limited time only"), "trial");
  assert.equal(classifyDealType("Students get Google AI Pro free for 1 year"), "trial");
  assert.equal(classifyDealType("deposit bonus of $10"), "deposit");
  assert.equal(classifyDealType("trade at least $100 volume"), "volume");
  assert.equal(classifyDealType("referral bonus for inviting a friend"), "invite");
  assert.equal(classifyDealType("half the commission on commodities"), "unverified");
  assert.equal(
    classifyDealType("Some are always free to all Azure customers, and some are free for 12 months"),
    "unverified",
  );
});

test("conditions and regions are copied only when the excerpt says them", () => {
  assert.match(extractConditions("UK residents only. Individual product Ts&Cs apply."), /UK residents only/);
  assert.equal(extractConditions("Open your free bank account in minutes."), "");
  assert.equal(extractRegions("No monthly fees and free 24/7 UK support"), "");
  assert.equal(extractRegions("UK residents only"), "UK residents only");
});

test("steps require a real list", () => {
  assert.equal(extractSteps("Visit the website and sign up"), "");
  const steps = extractSteps("<ol><li>Create an account</li><li>Verify the email</li></ol>");
  assert.match(steps, /1\. Create an account/);
  assert.match(steps, /2\. Verify the email/);
});

test("ranking puts stated amounts above qualitative text and 待核实 last", () => {
  const high = assessValue("$300 Welcome credit");
  const low = assessValue("$5 credits");
  const percent = assessValue("90% off");
  const qualitative = assessValue("free for everyone");
  const unknown = assessValue("details will be shared later");
  const yuan = assessValue("赠金 ¥10000");
  assert.ok(rankScore(high) > rankScore(low));
  assert.ok(rankScore(low) > rankScore(percent));
  assert.ok(rankScore(percent) > rankScore(qualitative));
  assert.ok(rankScore(qualitative) > rankScore(unknown));
  assert.equal(rankScore(unknown), 0);
  assert.ok(rankScore(high) > rankScore(yuan));
  assert.equal(yuan.tier, "unverified");
});

test("expiry uses the end of a date-only deadline and ignores missing deadlines", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  assert.equal(isExpired(null, now), false);
  assert.equal(isExpired("2026-11-10", now), false);
  assert.equal(isExpired("2026-11-09", now), true);
  assert.equal(isExpired("2026-11-10T11:00:00Z", now), true);
  assert.equal(isExpired("2026-11-10T13:00:00Z", now), false);
  assert.equal(isEndingSoon("2026-11-17", now), true);
  assert.equal(isEndingSoon("2026-11-18", now), false);
  assert.equal(isEndingSoon("2026-11-09", now), false);
  assert.equal(isEndingSoon(null, now), false);
});

test("page reconciliation archives only matches that disappeared after a good fetch", () => {
  assert.deepEqual(
    reconcilePlan({ kind: "page", fetchOk: true, existingIds: ["a", "b"], seenIds: ["b"] }),
    ["a"],
  );
  assert.deepEqual(reconcilePlan({ kind: "page", fetchOk: false, existingIds: ["a"], seenIds: [] }), []);
  assert.deepEqual(reconcilePlan({ kind: "feed", fetchOk: true, existingIds: ["a"], seenIds: [] }), []);
});

test("deal detector ignores ordinary listings and vulnerability wording", () => {
  assert.equal(isDealText("NEXO is available for trading"), false);
  assert.equal(isDealText("A Remote Use-After-Free in the Linux kernel"), false);
  assert.equal(isDealText("Reflection's Beam is freely available on Ollama for a limited time"), true);
  assert.equal(isDealText("Up to 90% off the context your agents resend"), true);
});

test("crypto and bank items always carry a risk note", () => {
  assert.ok(riskNote("crypto", "half the commission").length > 20);
  assert.ok(riskNote("bank", "free account").length > 20);
  assert.ok(riskNote("ucard", "no fees").length > 20);
  assert.equal(riskNote("ai", "$0 Free for everyone"), "");
  assert.match(riskNote("crypto", "guaranteed return"), /来源文本/);
});
