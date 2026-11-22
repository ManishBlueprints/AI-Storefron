import { afterEach, expect, it, vi } from "vitest";
import { publicationMetrics } from "../shared/activation";
import { allowedContext, eventQueue } from "../src/analytics-events";
const sessionId = "550e8400-e29b-41d4-a716-446655440000";
const started = "2026-11-21T10:00:00.000Z";
const first = "2026-11-21T10:03:00.000Z";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => values.delete(key),
  };
}
it("reuses a setup session across module reloads and expires after 30 minutes idle", async () => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  let tracker = await import("../src/setup-session");
  const initial = tracker.beginSetupSession(1000000);
  expect(initial.started).toBe(true);
  expect(initial.session.isNewCreator).toBe(true);
  vi.resetModules();
  tracker = await import("../src/setup-session");
  const resumed = tracker.beginSetupSession(1001000);
  expect(resumed.started).toBe(false);
  expect(resumed.session.id).toBe(initial.session.id);
  const expired = tracker.beginSetupSession(1001000 + 30 * 60 * 1000);
  expect(expired.started).toBe(true);
  expect(expired.session.id).not.toBe(initial.session.id);
});
it("marks later setup sessions as returning after a creator publishes", async () => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  const tracker = await import("../src/setup-session");
  tracker.beginSetupSession(1000000);
  tracker.markCreatorPublished();
  expect(tracker.beginSetupSession(3000000).session.isNewCreator).toBe(false);
});
it("works in the current page when browser storage is blocked", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
  });
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
  });
  const tracker = await import("../src/setup-session");
  const first = tracker.beginSetupSession(1000000);
  expect(tracker.beginSetupSession(1001000).session.id).toBe(first.session.id);
});
it("first publication records elapsed time, while updates retain the original first-publication time", () => {
  const record = {
    setup_session_id: sessionId,
    setup_started_at: started,
    new_creator_session: true,
    first_published_at: null,
  };
  const initial = publicationMetrics(record, first, sessionId);
  expect(initial).toMatchObject({
    first_publish: true,
    same_setup_session: true,
    time_to_first_publish_ms: 180000,
    new_creator_session: true,
  });
  const update = publicationMetrics(
    { ...record, first_published_at: first },
    "2026-11-21T11:00:00.000Z",
    sessionId,
  );
  expect(update.first_publish).toBe(false);
  expect(update.time_to_first_publish_ms).toBe(180000);
  expect(
    publicationMetrics(record, first, "650e8400-e29b-41d4-a716-446655440001")
      .same_setup_session,
  ).toBe(false);
  expect(publicationMetrics({}, first).time_to_first_publish_ms).toBeNull();
});
it("queues early analytics events once, caps pending events, and drops non-allowlisted properties", () => {
  const queue = eventQueue(2),
    capture = vi.fn();
  queue.send("input_started", {});
  queue.send("setup_started", { setup_session_id: sessionId });
  queue.send("generate_requested", {});
  expect(capture).not.toHaveBeenCalled();
  queue.connect(capture);
  queue.connect(capture);
  expect(capture.mock.calls.map((call) => call[0])).toEqual([
    "setup_started",
    "generate_requested",
  ]);
  queue.send("store_first_published", {});
  expect(capture).toHaveBeenCalledTimes(3);
  expect(
    allowedContext({
      setup_session_id: sessionId,
      first_publish: true,
      description: "private text",
      edit_token: "private token",
      slug: "private slug",
    } as any),
  ).toEqual({ setup_session_id: sessionId, first_publish: true });
});
it("never lets analytics delivery errors interrupt the product flow", () => {
  const queue = eventQueue();
  queue.send("setup_started", {});
  expect(() =>
    queue.connect(() => {
      throw Error("SDK unavailable");
    }),
  ).not.toThrow();
  expect(() => queue.send("store_first_published", {})).not.toThrow();
});
