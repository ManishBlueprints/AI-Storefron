import { describe, it, expect, vi } from "vitest";
import {
  contentSchema,
  creatorContext,
  preflight,
  priceBand,
  repairModel,
} from "../shared/domain";
import { templateContent } from "../shared/templates";
import {
  generate,
  parseJSON,
  responseSchema,
  systemPrompt,
} from "../shared/generation";
import { constantTimeEqual, hashToken, newToken } from "../shared/security";
import type { ModelConfig } from "../shared/generation";

const inputs = [
  "I teach fitness home workouts to beginners",
  "I share finance budgeting tips for students",
  "I teach cooking vegetarian recipes for students",
  "I teach exam preparation for UPSC students",
  "I offer reflective astrology and tarot education",
];
const config: ModelConfig = {
  key: "test-only-key",
  models: ["first:free", "second:free"],
  jsonModels: ["first:free", "second:free"],
  origin: "https://app.example",
};
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
    { status: 200 },
  );
function model() {
  const { source: _source, ...content } = templateContent(inputs[0], "en");
  return { ...content, input_quality: "ok", clarifying_question: null };
}

it("accepts topic-only input, merges context without duplication, and gates only non-answers", async () => {
  expect(preflight("fitness")).toBeNull();
  expect(preflight("fitness training")).toBeNull();
  expect(preflight("yoga")).toBeNull();
  expect(preflight("I make content")?.input_quality).toBe("too_vague");
  expect(preflight("asdfghjkl qwerty")?.input_quality).toBe("unusable");
  expect(preflight("@creator")?.clarifying_question).toContain("Instagram");
  expect(preflight("I teach guaranteed returns on stocks")?.input_quality).toBe(
    "unusable",
  );
  expect(
    creatorContext({
      description: "fitness",
      offer_status: "existing",
      existing_offer: "Fitness training",
    }),
  ).toBe("Fitness training");
  expect(
    creatorContext({
      description: "I teach yoga",
      offer_status: "existing",
      existing_offer: "Morning flow sessions",
    }),
  ).toBe("I teach yoga. Morning flow sessions");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(model()))
    .mockResolvedValueOnce(response(model()));
  const generated = await generate(
    { description: "fitness", language: "en" },
    { ...config, fetcher },
  );
  expect(fetcher).toHaveBeenCalled();
  expect(generated.input_quality).toBe("ok");
  const blocked = await generate(
    { description: "asdfghjkl qwerty", language: "en" },
    { ...config, fetcher },
  );
  expect(blocked.input_quality).toBe("unusable");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps provider schemas strict without defaults and returns model assumptions", async () => {
  const schema = JSON.stringify(responseSchema());
  expect(schema).not.toContain('"default"');
  expect(schema).toContain("assumptions");
  expect(schema).toContain("clarification_options");
  const assumptions = ["Beginner-friendly home workouts"];
  const fetcher = vi
    .fn()
    .mockResolvedValue(response({ ...model(), assumptions }));
  const result = await generate(
    { description: "fitness", language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("ok");
  if (result.input_quality === "ok")
    expect(result.assumptions).toEqual(assumptions);
});
it("keeps topic-specific clarification choices from the model", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      ...model(),
      input_quality: "too_vague",
      clarifying_question: "What kind of books do you share?",
      clarification_options: [
        "Book reviews",
        "Reading habits",
        "Recommendations",
      ],
    }),
  );
  const result = await generate(
    { description: "books", language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("too_vague");
  if (result.input_quality !== "ok")
    expect(result.clarification_options).toEqual([
      "Book reviews",
      "Reading habits",
      "Recommendations",
    ]);
});
it("allows a typed clarification without unrelated fallback choices", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      ...model(),
      input_quality: "too_vague",
      clarifying_question: "What kind of books do you share?",
      clarification_options: [],
    }),
  );
  const result = await generate(
    { description: "books", language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("too_vague");
  if (result.input_quality !== "ok")
    expect(result.clarification_options).toEqual([]);
});
it("honours semantic clarification regardless of known categories or word count", async () => {
  for (const description of [
    "fitness",
    "book reviews for beginners",
    "I make book notes and share reading tips",
  ]) {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        ...model(),
        input_quality: "too_vague",
        clarifying_question: "What kind of content do you share?",
      }),
    );
    const result = await generate(
      { description, language: "en" },
      { ...config, fetcher },
    );
    expect(result.input_quality).toBe("too_vague");
    if (result.input_quality === "ok")
      expect(contentSchema.safeParse(result.content).success).toBe(true);
    expect(fetcher).toHaveBeenCalled();
  }
});
describe.each(inputs)("fallback for %s", (description) => {
  it.each(["en", "hinglish"] as const)(
    "is valid in %s with niche-specific prices and distinct formats",
    (language) => {
      const content = templateContent(description, language);
      expect(contentSchema.safeParse(content).success).toBe(true);
      expect(new Set(content.products.map((p) => p.format)).size).toBe(
        content.products.length,
      );
      content.products.forEach((p) => {
        const [min, max] = priceBand(p.format, content.niche);
        expect(p.price_inr).toBeGreaterThanOrEqual(min);
        expect(p.price_inr).toBeLessThanOrEqual(max);
      });
      if (language === "hinglish") {
        expect(JSON.stringify(content)).not.toMatch(/[\u0900-\u097f]/);
        expect(content.bio.about).toContain("Mere");
      }
      expect(content.source).toBe("template");
    },
  );
});
it("has one band table in both prompt and validator, and clamps generation only", () => {
  const output = model();
  output.products[0].price_inr = 9999;
  const fixed = repairModel(output, "en");
  expect(fixed.products[0].price_inr).toBe(499);
  const edit = templateContent(inputs[0], "en");
  edit.products[0].price_inr = 9999;
  expect(contentSchema.parse(edit).products[0].price_inr).toBe(9999);
  edit.products[0].price_inr = 0;
  expect(contentSchema.parse(edit).products[0].price_inr).toBe(0);
  expect(systemPrompt({ description: inputs[0], language: "en" })).toContain(
    "ebook ₹99–499",
  );
});
it("retries invalid JSON once then moves through the ordered model list", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ broken: true }))
    .mockResolvedValueOnce(response({ broken: true }))
    .mockResolvedValueOnce(response(model()));
  const result = await generate(
    { description: inputs[0], language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("ok");
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetcher.mock.calls[0][1].body).models).toEqual([
    "first:free",
    "second:free",
  ]);
  expect(
    JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content,
  ).toContain("validation issue");
  expect(JSON.parse(fetcher.mock.calls[2][1].body).models).toEqual([
    "second:free",
  ]);
});
it("forced provider failure ends in a labelled template; cap avoids the provider entirely", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 401 }));
  const result = await generate(
    { description: inputs[0], language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality === "ok" && result.content.source).toBe(
    "template",
  );
  expect(fetcher).toHaveBeenCalledTimes(4);
  fetcher.mockClear();
  const capped = await generate(
    { description: inputs[0], language: "en" },
    { ...config, fetcher },
    undefined,
    false,
  );
  expect(capped.input_quality === "ok" && capped.content.source).toBe(
    "template",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("regenerates a single product without clamping another manually priced product", async () => {
  const current = templateContent(inputs[0], "en");
  current.products[1].price_inr = 9999;
  const product = {
    ...current.products[0],
    title: "A Different Movement Guide",
    price_inr: 9999,
  };
  const result = await generate(
    { description: inputs[0], language: "en" },
    { ...config, fetcher: vi.fn().mockResolvedValue(response(product)) },
    { scope: "product", current, product_id: "p1" },
  );
  expect(result.input_quality).toBe("ok");
  if (result.input_quality === "ok") {
    expect(result.content.bio).toEqual(current.bio);
    expect(result.content.products[1]).toEqual(current.products[1]);
    expect(result.content.products[0].price_inr).toBe(499);
  }
});
it("rejects filler, mixed scripts, duplicate formats and incorrect language", () => {
  const output = model();
  output.bio.headline = "Unlock your potential";
  expect(() => repairModel(output, "en")).toThrow();
  output.bio.headline = "Start moving";
  expect(() => repairModel(output, "hinglish")).toThrow();
  output.language = "hinglish";
  output.bio.headline = "नमस्ते";
  expect(() => repairModel(output, "hinglish")).toThrow();
  const duplicate = model();
  duplicate.products[1].format = duplicate.products[0].format;
  expect(() => repairModel(duplicate, "en")).toThrow();
});
it("strips code fences; stores a SHA-256 hash and compares tokens without an early return", async () => {
  expect(parseJSON('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  const token = newToken();
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  const hash = await hashToken(token);
  expect(hash).toHaveLength(64);
  expect(hash).not.toBe(token);
  expect(constantTimeEqual(hash, await hashToken(token))).toBe(true);
  expect(constantTimeEqual(hash, await hashToken("wrong"))).toBe(false);
  expect(constantTimeEqual("abc", "abc0")).toBe(false);
});

it("feeds field-specific constraints into repair retries without logging model copy", async () => {
  const invalid = model();
  invalid.bio.about = "PRIVATE_MODEL_COPY";
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(invalid))
    .mockResolvedValueOnce(response(model()));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const result = await generate(
      { description: inputs[0], language: "en" },
      { ...config, disableReasoning: true, fetcher },
    );
    expect(result.input_quality === "ok" && result.content.source).toBe("ai");
    const retry = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(retry.messages[1].content).toContain("bio.about");
    expect(retry.messages[1].content).toContain("minimum 150");
    expect(JSON.stringify(warning.mock.calls)).not.toContain(
      "PRIVATE_MODEL_COPY",
    );
    expect(retry.reasoning).toEqual({ enabled: false });
  } finally {
    warning.mockRestore();
  }
});

it.each(["Rate limit exceeded: free-models-per-day", "Provider is busy"])(
  "reports rate limits without retrying or substituting templates: %s",
  async (message) => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ error: { message } }), { status: 429 }),
      );
    await expect(
      generate(
        { description: inputs[0], language: "en" },
        { ...config, fetcher },
      ),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("no generic storefront was created"),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("detects truncated output and logs response metadata without logging copy", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: { content: "PRIVATE_INCOMPLETE_COPY" },
              },
            ],
            usage: {
              completion_tokens: 2200,
              completion_tokens_details: { reasoning_tokens: 2100 },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(response(model()));
    const result = await generate(
      { description: inputs[0], language: "en" },
      { ...config, fetcher },
    );
    expect(result.input_quality === "ok" && result.content.source).toBe("ai");
    expect(
      JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content,
    ).toContain("truncated");
    expect(JSON.stringify(info.mock.calls)).toContain("reasoning_tokens");
    expect(JSON.stringify([info.mock.calls, warning.mock.calls])).not.toContain(
      "PRIVATE_INCOMPLETE_COPY",
    );
  } finally {
    info.mockRestore();
    warning.mockRestore();
  }
});

it("uses Kilo's model parameter without leaking the OpenRouter credential", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(model()));
  const result = await generate(
    { description: inputs[0], language: "en" },
    { ...config, provider: "kilo", key: "", maxTokens: 8192, fetcher },
  );
  expect(result.input_quality === "ok" && result.content.source).toBe("ai");
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe("https://ai-gateway.kilo.ai/api/v1/chat/completions");
  expect(request.headers).not.toHaveProperty("Authorization");
  const body = JSON.parse(request.body);
  expect(body.model).toBe("first:free");
  expect(body).not.toHaveProperty("models");
  expect(body.max_tokens).toBe(8192);
});

it("tries the next configured Kilo model after invalid output", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ broken: true }))
    .mockResolvedValueOnce(response({ broken: true }))
    .mockResolvedValueOnce(response(model()));
  const result = await generate(
    { description: inputs[0], language: "en" },
    { ...config, provider: "kilo", key: "kilo-test-only", fetcher },
  );
  expect(result.input_quality === "ok" && result.content.source).toBe("ai");
  expect(fetcher.mock.calls.map(([, r]) => JSON.parse(r.body).model)).toEqual([
    "first:free",
    "first:free",
    "second:free",
  ]);
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer kilo-test-only",
  );
});

it("keeps Kilo failures explicit instead of creating generic template cards", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response("{}", { status: 503 }));
  await expect(
    generate(
      { description: inputs[0], language: "en" },
      { ...config, provider: "kilo", key: "", fetcher },
    ),
  ).rejects.toMatchObject({ status: 503 });
});

it("does not call Kilo when the application daily cap is reached", async () => {
  const fetcher = vi.fn();
  await expect(
    generate(
      { description: inputs[0], language: "en" },
      { ...config, provider: "kilo", key: "", fetcher },
      undefined,
      false,
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(fetcher).not.toHaveBeenCalled();
});

it("uses a bio-only prompt and strict response schema for Kilo bio regeneration", async () => {
  const current = templateContent(inputs[0], "en");
  const bio = { ...current.bio, headline: "A new beginner movement plan" };
  const fetcher = vi.fn().mockResolvedValue(response(bio));
  const scope = { scope: "bio" as const, current };
  const result = await generate(
    { description: inputs[0], language: "en" },
    { ...config, provider: "kilo", key: "", fetcher },
    scope,
  );
  expect(result.input_quality === "ok" && result.content.bio.headline).toBe(
    bio.headline,
  );
  const request = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(request.response_format.type).toBe("json_schema");
  expect(request.response_format.json_schema.strict).toBe(true);
  expect(request.response_format.json_schema.schema.required).toEqual([
    "headline",
    "about",
  ]);
  expect(
    request.response_format.json_schema.schema.properties,
  ).not.toHaveProperty("products");
  expect(request.messages[0].content).not.toContain("Include 2-4 products");
  expect(result.input_quality === "ok" && result.content.products).toEqual(
    current.products,
  );
});

it("reports invalid bio output accurately rather than calling it a timeout", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      response({ bio: { title: "wrong shape" } }),
    );
  await expect(
    generate(
      { description: inputs[0], language: "en" },
      { ...config, provider: "kilo", models: ["first:free"], key: "", fetcher },
      { scope: "bio", current: templateContent(inputs[0], "en") },
    ),
  ).rejects.toThrow("bio in an invalid format");
});

it.each([
  [
    "stray non-Roman character",
    (text: string) => text.slice(0, 200) + " Meri培",
  ],
  [
    "unfinished sentence",
    (text: string) => text.replace(/[.!?]+$/, "") + " Meri",
  ],
  [
    "ellipsis instead of a completed sentence",
    (text: string) => text.replace(/[.!?]+$/, "") + "…",
  ],
] as const)(
  "retries a bio containing %s instead of accepting it",
  async (_name, corrupt) => {
    const broken = model();
    broken.bio.about = corrupt(broken.bio.about);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(broken))
      .mockResolvedValueOnce(response(model()));
    const result = await generate(
      { description: inputs[0], language: "en" },
      { ...config, fetcher },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.input_quality).toBe("ok");
    if (result.input_quality === "ok")
      expect(result.content.bio.about).toBe(model().bio.about);
  },
);

it("checks sentence completion during single-bio regeneration too", async () => {
  const current = templateContent(inputs[0], "hinglish");
  const validBio = {
    headline: "Practical fitness guidance for busy beginners",
    about: current.bio.about.replace("Mere", "Hamare"),
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        ...validBio,
        about: validBio.about.replace(/[.!?]+$/, "") + " Meri",
      }),
    )
    .mockResolvedValueOnce(response(validBio));
  const result = await generate(
    { description: inputs[0], language: "hinglish" },
    { ...config, fetcher },
    { scope: "bio", current },
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  if (result.input_quality === "ok")
    expect(result.content.bio).toEqual(validBio);
  else throw new Error("Expected a valid regenerated bio");
});

it("instructs every generation scope to use complete paragraphs and plain professional language", () => {
  const current = templateContent(inputs[0], "en");
  const scopes = [
    undefined,
    { scope: "bio" as const, current },
    { scope: "product" as const, current, product_id: "p1" },
  ];
  for (const scope of scopes) {
    const prompt = systemPrompt(
      { description: inputs[0], language: "en" },
      scope,
    );
    expect(prompt).toContain(
      "professional, concise language with familiar everyday words",
    );
    expect(prompt).toContain("Every paragraph must express a complete thought");
    expect(prompt).toContain(
      "never leave a sentence, list, or paragraph unfinished",
    );
  }
});

it.each(["CRM", "HR", "B2B", "nginx", "उद्यान", "gymnastics"])(
  "does not reject valid or unfamiliar text %s with vowel heuristics",
  (text) => {
    expect(preflight(text)).toBeNull();
  },
);
it.each(["123456", "!!!", "aaaaaaa", "asdfghjkl qwerty"])(
  "rejects obvious junk %s",
  (text) => {
    expect(preflight(text)?.input_quality).toBe("unusable");
  },
);
it("preserves full descriptions and separate context in the model request", async () => {
  const description = "I teach pottery. ".repeat(63).slice(0, 1000);
  const fetcher = vi.fn().mockResolvedValue(response(model()));
  await generate(
    {
      description,
      language: "en",
      context_tags: ["Beginners"],
      clarification_answer: "Pottery classes",
    },
    { ...config, fetcher },
  );
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  const data = JSON.parse(body.messages[1].content);
  expect(data.description).toBe(description);
  expect(data.context_tags).toEqual(["Beginners"]);
  expect(data.clarification_answer).toBe("Pottery classes");
});
it("does not convert another clarification into invented cards after an answer", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      ...model(),
      input_quality: "too_vague",
      clarifying_question: "What do you mean?",
    }),
  );
  const result = await generate(
    {
      description: "not sure",
      language: "en",
      clarification_answer: "anything",
    },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("unusable");
  expect("content" in result).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("defers random words with vowels to semantic validation", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      ...model(),
      input_quality: "unusable",
      clarifying_question: "Please describe a skill you teach.",
    }),
  );
  const result = await generate(
    { description: "plofrane zubnoki", language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("unusable");
});

it("accepts a compact clarification without generating placeholder bio or offers", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      input_quality: "too_vague",
      clarifying_question: "What kind of pottery do you teach?",
      clarification_options: ["Wheel throwing", "Hand building", "Glazing"],
      bio: null,
      products: [],
      niche: "other",
      language: "en",
      assumptions: [],
    }),
  );
  const result = await generate(
    { description: "pottery", language: "en" },
    { ...config, fetcher },
  );
  expect(result.input_quality).toBe("too_vague");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect("content" in result).toBe(false);
});
