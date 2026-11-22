import { expect, it } from "vitest";
import {
  contentSchema,
  generateSchema,
  publishableContent,
  repairModel,
} from "../supabase/functions/_shared/domain";
import { systemPrompt } from "../supabase/functions/_shared/generation";
import { templateContent } from "../supabase/functions/_shared/templates";
it("requires detail for an existing offer and leaves offer context optional", () => {
  expect(
    generateSchema.safeParse({
      description: "I teach home fitness workouts",
      language: "en",
      offer_status: "existing",
    }).success,
  ).toBe(false);
  expect(
    generateSchema.safeParse({
      description: "I teach home fitness workouts",
      language: "en",
    }).success,
  ).toBe(true);
  expect(
    systemPrompt({
      description: "I teach home fitness workouts",
      language: "en",
      offer_status: "exploring",
    }),
  ).toContain("no existing offer");
  expect(
    systemPrompt({
      description: "I teach home fitness workouts",
      language: "en",
      offer_status: "existing",
      existing_offer: "A live yoga session",
    }),
  ).toContain("Improve its positioning");
});
it("new AI and template offers always require creator review, even if the model claims readiness", () => {
  const content = templateContent("I teach fitness workouts", "en");
  expect(content.products.every((p) => !p.ready_to_sell)).toBe(true);
  const { source: _source, ...model } = content;
  const result = repairModel(
    {
      ...model,
      input_quality: "ok",
      clarifying_question: null,
      products: model.products.map((p) => ({ ...p, ready_to_sell: true })),
    },
    "en",
  );
  expect(result.products.every((p) => !p.ready_to_sell)).toBe(true);
});
it("keeps 2–4 private ideas while publishing only reviewed offers, including a single ready offer", () => {
  const content = templateContent("I teach cooking recipes", "en");
  expect(() => publishableContent(content)).toThrow();
  content.products[0].ready_to_sell = true;
  const snapshot = publishableContent(content);
  expect(snapshot.products).toHaveLength(1);
  expect(contentSchema.parse(content).products).toHaveLength(2);
  expect(snapshot.products[0].id).toBe("p1");
});
it.each(["en", "hinglish"] as const)(
  "exploration templates use low-preparation formats in %s",
  (language) => {
    const content = templateContent(
      "I teach simple cooking",
      "en",
      null,
      "exploring",
    );
    expect(content.products.map((p) => p.format)).toEqual([
      "one_on_one",
      "community",
    ]);
    expect(
      templateContent(
        "I teach simple cooking",
        language,
        null,
        "exploring",
      ).products.every((p) => !p.ready_to_sell),
    ).toBe(true);
  },
);
