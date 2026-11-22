import { afterEach, describe, expect, it, vi } from "vitest";
import { editorStep, restoreBlock } from "../src/editor-state";
import { verifyOwnerAccess } from "../src/owner-access";
import { readLocal, tokenKey, writeLocal } from "../src/storage";
import { templateContent } from "../shared/templates";
import { contentSchema } from "../shared/domain";

afterEach(() => vi.unstubAllGlobals());
it("keeps a valid saved token when a bad edit link fails verification", async () => {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  writeLocal(tokenKey("test-store"), "a".repeat(64));
  await expect(
    verifyOwnerAccess("test-store", "b".repeat(64), async () => {
      throw new Error("Forbidden");
    }),
  ).rejects.toThrow("Forbidden");
  expect(readLocal(tokenKey("test-store"), "")).toBe("a".repeat(64));
  const verified = await verifyOwnerAccess(
    "test-store",
    "c".repeat(64),
    async () => ({ slug: "test-store" }),
  );
  expect(verified.persisted).toBe(true);
  expect(readLocal(tokenKey("test-store"), "")).toBe("c".repeat(64));
});
it("still opens a verified store when browser storage is unavailable", async () => {
  vi.stubGlobal("localStorage", {
    setItem: () => {
      throw new Error("Storage disabled");
    },
  });
  const result = await verifyOwnerAccess(
    "test-store",
    "a".repeat(64),
    async () => ({ slug: "test-store" }),
  );
  expect(result.persisted).toBe(false);
  expect(result.store.slug).toBe("test-store");
});
it("rejects incompatible restores without changing valid current content", () => {
  const original = templateContent(
    "I teach fitness workouts for beginners",
    "en",
  );
  const current = structuredClone(original);
  current.products[0].format = "community";
  current.products[0].billing = "monthly";
  current.products[1].format = "ebook";
  current.products[1].billing = "one_time";
  const before = structuredClone(current);
  expect(() => restoreBlock(current, "p1", original.products[0])).toThrow(
    "conflicts",
  );
  expect(current).toEqual(before);
  expect(contentSchema.safeParse(current).success).toBe(true);
  expect(restoreBlock(current, "bio", original.bio).bio).toEqual(original.bio);
});
it("restores a compatible product and refuses products removed by regeneration", () => {
  const original = templateContent(
    "I teach fitness workouts for beginners",
    "en",
  );
  const changed = structuredClone(original);
  changed.products[0].title = "My new title";
  expect(restoreBlock(changed, "p1", original.products[0])).toEqual(original);
  expect(() =>
    restoreBlock(changed, "p3", { ...original.products[0], id: "p3" }),
  ).toThrow("no longer");
});
describe("guided editor navigation", () => {
  it("starts new drafts in review and returning published stores in manage", () => {
    expect(editorStep("draft", null, 0)).toBe("review");
    expect(editorStep("published", null, 1)).toBe("manage");
  });
  it("keeps zero-ready drafts out of preview and publication, including direct URLs", () => {
    for (const status of ["draft", "published"] as const) {
      expect(editorStep(status, "preview", 0)).toBe("review");
      expect(editorStep(status, "publish", 0)).toBe("review");
    }
  });
  it("preserves valid steps and rejects unknown or draft-management steps", () => {
    expect(editorStep("draft", "preview", 1)).toBe("preview");
    expect(editorStep("draft", "publish", 1)).toBe("publish");
    expect(editorStep("published", "review", 1)).toBe("review");
    expect(editorStep("draft", "manage", 1)).toBe("review");
    expect(editorStep("draft", "unknown", 1)).toBe("review");
  });
});
