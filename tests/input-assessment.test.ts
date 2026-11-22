import { expect, it, vi } from "vitest";
import { assessInput } from "../shared/input-assessment";
import type { ModelConfig } from "../shared/generation";
const config: ModelConfig = {
  provider: "kilo",
  key: "test-only",
  models: ["test:free"],
  jsonModels: ["test:free"],
  origin: "https://app.example",
};
const response = (result: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }),
  );
it("rejects obvious junk before spending model quota", async () => {
  const fetcher = vi.fn();
  expect(
    (
      await assessInput(
        { description: "asdfghjkl", language: "en" },
        { ...config, fetcher },
      )
    ).input_quality,
  ).toBe("unusable");
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(["fitness", "pottery", "ugqugbdkasbd021e"])(
  "can clarify any input on the first step: %s",
  async (description) => {
    const result = {
      input_quality: "too_vague",
      clarifying_question: "What skill do you teach?",
      clarification_options: [],
    };
    const fetcher = vi.fn().mockResolvedValue(response(result));
    expect(
      await assessInput(
        { description, language: "en" },
        { ...config, fetcher },
      ),
    ).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it("accepts a meaningful clarification without generating offers", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      input_quality: "ok",
      clarifying_question: null,
      clarification_options: [],
    }),
  );
  const result = await assessInput(
    {
      description: "pottery",
      language: "en",
      clarification_answer: "I teach hand building to beginners",
    },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("ok");
  expect(result).not.toHaveProperty("content");
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(JSON.parse(body.messages[1].content).clarification_answer).toContain(
    "hand building",
  );
});
it("does not permit another clarification loop after an unhelpful answer", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      input_quality: "too_vague",
      clarifying_question: "What do you mean?",
      clarification_options: ["Other"],
    }),
  );
  const result = await assessInput(
    {
      description: "not sure",
      language: "en",
      clarification_answer: "anything",
    },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("unusable");
  expect(result.clarification_options).toEqual([]);
});
it("keeps users on their description if the provider is unavailable", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("unavailable", { status: 503 }));
  await expect(
    assessInput(
      { description: "pottery", language: "en" },
      { ...config, fetcher },
    ),
  ).rejects.toThrow("couldn’t check");
});
