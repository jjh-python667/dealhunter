import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_FEEDBACK,
  feedbackHashes,
  feedbackWindowStart,
  isFeedbackBrowserId,
  isFeedbackReviewStatus,
  isFeedbackTermsVersion,
  isFeedbackVote,
  publicFeedbackSummary,
  summarizeFeedback,
} from "../src/feedback";

test("feedback accepts only the three documented votes", () => {
  assert.equal(isFeedbackVote("works"), true);
  assert.equal(isFeedbackVote("expired"), true);
  assert.equal(isFeedbackVote("unknown"), true);
  for (const bad of ["yes", "works ", "", null, 1, undefined]) assert.equal(isFeedbackVote(bad), false, String(bad));
});

test("browser ids and terms versions are validated before touching the database", () => {
  assert.equal(isFeedbackBrowserId("browser-test-0000001"), true);
  for (const bad of ["short", "has space 12345678", "x".repeat(81), null, 42]) assert.equal(isFeedbackBrowserId(bad), false, String(bad));
  assert.equal(isFeedbackTermsVersion(dealVersion()), true);
  for (const bad of ["", "UPPER", "with space", "中文", null, 7]) assert.equal(isFeedbackTermsVersion(bad), false, String(bad));
  assert.equal(isFeedbackReviewStatus("kept"), true);
  assert.equal(isFeedbackReviewStatus("pending"), true);
  assert.equal(isFeedbackReviewStatus("approved"), false);
});

test("the public aggregate window is 72 hours", () => {
  const now = new Date("2026-11-10T03:00:00Z");
  assert.equal(feedbackWindowStart(now), "2026-11-07T03:00:00.000Z");
});

test("feedback hashes are deterministic, network hashes rotate daily and never expose the raw address", async () => {
  const browserId = "browser-test-0000001";
  const first = await feedbackHashes({ browserId, networkKey: "203.0.113.10", now: new Date("2026-11-10T01:00:00Z") });
  const sameDay = await feedbackHashes({ browserId, networkKey: "203.0.113.10", now: new Date("2026-11-10T22:00:00Z") });
  const nextDay = await feedbackHashes({ browserId, networkKey: "203.0.113.10", now: new Date("2026-11-11T01:00:00Z") });
  assert.equal(first.browserHash, sameDay.browserHash);
  assert.equal(first.networkHash, sameDay.networkHash);
  assert.equal(first.browserHash, nextDay.browserHash);
  assert.notEqual(first.networkHash, nextDay.networkHash);
  const otherNetwork = await feedbackHashes({ browserId, networkKey: "198.51.100.7", now: new Date("2026-11-10T01:00:00Z") });
  assert.notEqual(first.networkHash, otherNetwork.networkHash);
  for (const value of [first.browserHash, first.networkHash]) {
    assert.match(value, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(value, /203\.0\.113\.10|browser-test/);
  }
});

test("a secret pepper changes both hashes and stays out of the output", async () => {
  const base = { browserId: "browser-test-0000001", networkKey: "203.0.113.10", now: new Date("2026-11-10T01:00:00Z") };
  const unpeppered = await feedbackHashes(base);
  const peppered = await feedbackHashes({ ...base, pepper: "deployment-secret" });
  const samePepper = await feedbackHashes({ ...base, pepper: "deployment-secret" });
  const otherPepper = await feedbackHashes({ ...base, pepper: "other-secret" });
  assert.notEqual(peppered.browserHash, unpeppered.browserHash);
  assert.notEqual(peppered.networkHash, unpeppered.networkHash);
  assert.equal(peppered.browserHash, samePepper.browserHash);
  assert.equal(peppered.networkHash, samePepper.networkHash);
  assert.notEqual(peppered.networkHash, otherPepper.networkHash);
  for (const value of [peppered.browserHash, peppered.networkHash]) {
    assert.match(value, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(value, /deployment-secret/);
  }
});

test("public display requires three browsers and two network groups", () => {
  assert.deepEqual(summarizeFeedback([]), EMPTY_FEEDBACK);
  const notYet = summarizeFeedback([{ vote: "works", total: 2, browsers: 2, networks: 1, last_at: null }]);
  assert.equal(notYet.display, "none");
  assert.equal(notYet.works, 2);

  const positive = summarizeFeedback([{ vote: "works", total: 3, browsers: 3, networks: 2, last_at: "2026-11-10T00:00:00.000Z" }]);
  assert.equal(positive.display, "positive");
  assert.equal(positive.works, 3);
  assert.equal(positive.lastAt, "2026-11-10T00:00:00.000Z");
});

test("two differently-networked expired reports pause the positive hint", () => {
  const conflict = summarizeFeedback([
    { vote: "works", total: 3, browsers: 3, networks: 2, last_at: null },
    { vote: "expired", total: 2, browsers: 2, networks: 2, last_at: null },
  ]);
  assert.equal(conflict.display, "conflict");
  assert.equal(conflict.expired, 2);
  assert.equal(conflict.expiredNetworks, 2);
});

test("unknown votes are counted but never presented as a positive signal", () => {
  const summary = summarizeFeedback([{ vote: "unknown", total: 3, browsers: 3, networks: 2, last_at: null }]);
  assert.equal(summary.unknown, 3);
  assert.equal(summary.works, 0);
  assert.equal(summary.display, "none");
});

test("the public summary omits anti-abuse browser and network counts", () => {
  const internal = summarizeFeedback([
    { vote: "works", total: 3, browsers: 3, networks: 2, last_at: "2026-11-10T00:00:00.000Z" },
    { vote: "expired", total: 1, browsers: 1, networks: 1, last_at: null },
  ]);
  const publicView = publicFeedbackSummary(internal);
  assert.deepEqual(Object.keys(publicView).sort(), ["display", "expired", "lastAt", "total", "unknown", "works"]);
  assert.equal(publicView.display, "positive");
  assert.equal(publicView.works, 3);
  assert.equal("worksBrowsers" in publicView, false);
  assert.equal("worksNetworks" in publicView, false);
  assert.equal("expiredNetworks" in publicView, false);
});

function dealVersion(): string {
  return "abc123def";
}
