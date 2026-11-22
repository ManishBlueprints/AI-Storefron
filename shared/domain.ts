import { z } from "zod";
import { setupContextSchema } from "./activation.ts";

export const niches = [
  "fitness",
  "finance",
  "cooking",
  "exam_prep",
  "astrology",
  "other",
] as const;
export const languages = ["en", "hinglish"] as const;
export const formats = [
  "ebook",
  "template_pack",
  "recorded_course",
  "cohort_course",
  "one_on_one",
  "community",
] as const;
export type Niche = (typeof niches)[number];
export type Language = (typeof languages)[number];
export type Format = (typeof formats)[number];
export type Audience = "under_5k" | "5k_25k" | "25k_plus" | null;
export const PRICE_BANDS: Record<Format, readonly [number, number]> = {
  ebook: [99, 499],
  template_pack: [199, 799],
  recorded_course: [499, 1999],
  cohort_course: [1499, 4999],
  one_on_one: [299, 1499],
  community: [99, 499],
};
export function priceBand(
  format: Format,
  niche: Niche,
): readonly [number, number] {
  if (
    (niche === "finance" || niche === "exam_prep") &&
    format === "cohort_course"
  ) {
    return [1499, 7999];
  }
  if (niche === "astrology" && format === "one_on_one") return [499, 2499];
  if (niche === "fitness" && format === "community") return [499, 1499];
  if (niche === "cooking" && format === "ebook") return [99, 399];
  return PRICE_BANDS[format];
}
export function bandTable() {
  return niches
    .map(
      (n) =>
        `${n}: ${formats
          .map(
            (f) =>
              `${f} ₹${priceBand(f, n).join("–")}${
                f === "community" ? "/month" : ""
              }`,
          )
          .join("; ")}`,
    )
    .join("\n");
}
export const formatLabels: Record<Format, string> = {
  ebook: "E-book",
  template_pack: "Template pack",
  recorded_course: "Recorded course",
  cohort_course: "Live cohort",
  one_on_one: "1:1 session",
  community: "Community",
};
export const bioSchema = z
  .object({
    headline: z.string().trim().min(1).max(60),
    about: z.string().trim().min(150).max(300),
  })
  .strict();
export const productSchema = z
  .object({
    id: z.string().regex(/^p[1-4]$/),
    title: z.string().trim().min(1).max(60),
    format: z.enum(formats),
    price_inr: z.number().int().min(0).max(10000000),
    billing: z.enum(["one_time", "monthly"]),
    description: z.string().trim().min(120).max(280),
    price_rationale: z.string().trim().min(1).max(140),
    ready_to_sell: z.boolean().default(false),
  })
  .strict();
export const productsSchema = z
  .array(productSchema)
  .min(2)
  .max(4)
  .superRefine((products, ctx) => {
    if (new Set(products.map((p) => p.format)).size !== products.length) {
      ctx.addIssue({
        code: "custom",
        message: "Products must have different formats",
      });
    }
    if (new Set(products.map((p) => p.id)).size !== products.length) {
      ctx.addIssue({ code: "custom", message: "Product IDs must be unique" });
    }
    if (
      products.some((p) => p.format === "community" && p.billing !== "monthly")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Community must be billed monthly",
      });
    }
  });
export const contentSchema = z
  .object({
    niche: z.enum(niches),
    language: z.enum(languages),
    bio: bioSchema,
    products: productsSchema,
    source: z.enum(["ai", "template"]),
  })
  .strict();
export const publicContentSchema = contentSchema.extend({
  products: z.array(productSchema).min(1).max(4),
});
export function publishableContent(content: Content): Content {
  return publicContentSchema.parse({
    ...content,
    products: content.products.filter((product) => product.ready_to_sell),
  });
}
export type Content = z.infer<typeof contentSchema>;
export type Product = z.infer<typeof productSchema>;
export const modelSchema = z
  .object({
    input_quality: z.enum(["ok", "too_vague", "unusable"]),
    clarifying_question: z.string().max(200).nullable(),
    clarification_options: z
      .array(z.string().trim().min(1).max(60))
      .max(5)
      .default([]),
    assumptions: z.array(z.string().trim().min(1).max(90)).max(4).default([]),
    niche: z.enum(niches),
    language: z.enum(languages),
    bio: bioSchema,
    products: productsSchema,
  })
  .strict();
export type ModelOutput = z.infer<typeof modelSchema>;
export const generateSchema = z
  .object({
    ...setupContextSchema.shape,
    offer_status: z.enum(["existing", "exploring"]).nullish(),
    existing_offer: z.string().trim().max(500).optional(),
    description: z.string().trim().min(1).max(1000),
    context_tags: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
    clarification_answer: z.string().trim().min(1).max(120).optional(),
    audience_size: z.enum(["under_5k", "5k_25k", "25k_plus"]).nullish(),
    language: z.enum(languages),
    handle: z
      .string()
      .trim()
      .max(50)
      .regex(/^@?[a-zA-Z0-9._]*$/)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.offer_status !== "existing" ||
      Boolean(value.existing_offer?.trim()),
    {
      path: ["existing_offer"],
      message: "Describe the offer you already have.",
    },
  );
export const assessmentInputSchema = z
  .object({
    description: generateSchema.shape.description,
    language: generateSchema.shape.language,
    context_tags: generateSchema.shape.context_tags,
    clarification_answer: generateSchema.shape.clarification_answer,
  })
  .strict();
export const assessmentResultSchema = z
  .object({
    input_quality: z.enum(["ok", "too_vague", "unusable"]),
    clarifying_question: z.string().trim().max(200).nullable(),
    clarification_options: z.array(z.string().trim().min(1).max(60)).max(5),
  })
  .strict()
  .refine((v) => v.input_quality === "ok" || Boolean(v.clarifying_question), {
    message: "Provide guidance for unclear input.",
  });
export type GenerateInput = z.infer<typeof generateSchema>;
export const slugSchema = z.string().regex(/^[a-z0-9-]{8,64}$/);
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ownerSchema = z.object({
  slug: slugSchema,
  edit_token: tokenSchema,
});
export const mutationSchema = ownerSchema.extend({
  expected_updated_at: z.string().datetime({ offset: true }),
});
export const regenerateSchema = mutationSchema
  .extend({
    scope: z.enum(["all", "bio", "product"]),
    product_id: z
      .string()
      .regex(/^p[1-4]$/)
      .optional(),
    language: z.enum(languages),
  })
  .strict()
  .refine(
    (v) => v.scope !== "product" || Boolean(v.product_id),
    "product_id is required",
  );
export const patchSchema = mutationSchema
  .extend({ content: contentSchema })
  .strict();
export function detectNiche(text: string): Niche {
  const checks: [Niche, RegExp][] = [
    ["fitness", /\b(fitness|workouts?|yoga|gym|exercise|pilates)\b/i],
    [
      "finance",
      /\b(finance|financial|invest(?:ing|ment|ments)?|money|stocks?|budget(?:ing)?|savings?)\b/i,
    ],
    ["cooking", /\b(cook(?:ing)?|recipes?|bake|baking|food|chef)\b/i],
    ["exam_prep", /\b(exams?|upsc|neet|jee|study|studying|ssc|cat)\b/i],
    ["astrology", /\b(astrology|astro|tarot|horoscopes?|kundli)\b/i],
  ];
  return checks.find(([, regex]) => regex.test(text))?.[0] ?? "other";
}
export const HANDLE_ONLY =
  "We can’t read Instagram yet. Tell us in a line what you do.";
export const focusSuggestions: Record<Niche, string[]> = {
  fitness: ["Home workouts", "Gym training", "Weight loss", "Yoga"],
  finance: ["Budgeting", "Saving money", "Investing basics", "Debt payoff"],
  cooking: [
    "Quick everyday meals",
    "Vegetarian cooking",
    "Budget meals",
    "Meal prep",
  ],
  exam_prep: [
    "Study schedules",
    "Revision plans",
    "Mock tests",
    "Current affairs",
  ],
  astrology: [
    "Birth chart reading",
    "Tarot",
    "Relationships",
    "Career guidance",
  ],
  other: [],
};
const starterTopics = ["Books", "Cooking", "Fitness", "Art"];
const NON_ANSWER =
  /^(?:(?:i\s+)?(?:just\s+)?(?:make|create|post|share)\s+(?:some\s+)?(?:content|videos?|stuff|things)|content|videos?|stuff|things|anything|something|no idea|not sure|idk|nothing|hi+|hello+|hey+|test|lorem ipsum)$/i;
export function preflight(text: string): {
  input_quality: "too_vague" | "unusable";
  clarifying_question: string;
  clarification_options: string[];
} | null {
  const value = text.trim();
  if (
    /\b(porn|pornography|sexual services|sell drugs|drug dealing|make bombs|build bombs|guaranteed? returns?|guaranteed? cure|cure cancer|cure diabetes)\b/i.test(
      value,
    )
  ) {
    return {
      input_quality: "unusable",
      clarifying_question:
        "We can help with safe educational content. Describe a skill without adult, illegal, or guaranteed medical or financial outcomes.",
      clarification_options: [],
    };
  }
  if (/^@[a-zA-Z0-9._]+$/.test(value)) {
    return {
      input_quality: "too_vague",
      clarifying_question: HANDLE_ONLY,
      clarification_options: starterTopics,
    };
  }
  if (
    !/\p{L}/u.test(value) ||
    /^(?:(?:asdf[a-z]*|qwerty[a-z]*|zxcv[a-z]*|hjkl[a-z]*|blah|test|lorem ipsum)(?:\s+|$))+$/i.test(
      value,
    ) ||
    /(.)\1{5}/.test(value)
  ) {
    return {
      input_quality: "unusable",
      clarifying_question:
        "Tell us about a skill or the content you create. For example: “I share easy vegetarian recipes for students.”",
      clarification_options: [],
    };
  }
  if (NON_ANSWER.test(value)) {
    return {
      input_quality: "too_vague",
      clarifying_question:
        "What topic or skill do you share? One word is enough to start.",
      clarification_options: starterTopics,
    };
  }
  return null;
}
export const bannedPhrases =
  /unlock your potential|transform your life|guaranteed? (income|returns?|results?|cure|profit)|risk[- ]free (returns?|invest)|get rich|double your money|cure (diabetes|cancer)|100% (safe|success|guaranteed)/i;
export function checkCopy(
  content: Pick<Content, "bio" | "products" | "language">,
) {
  const visible = JSON.stringify({
    bio: content.bio,
    products: content.products,
  });
  if (bannedPhrases.test(visible)) {
    throw new Error("Remove generic filler and guaranteed outcome claims.");
  }
  if (content.language === "hinglish" && /[\u0900-\u097f]/.test(visible)) {
    throw new Error("Hinglish must use Roman script.");
  }
  if (content.products.some((p) => /[^\x00-\x7F₹’‘“”–—]/.test(p.title))) {
    throw new Error("Product titles must stay in English.");
  }
}
// Validate generated prose without imposing these constraints on creator edits.
export function checkGeneratedCopy(text: string, path: (string | number)[]) {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (
    letters.some((letter) => !/\p{Script=Latin}/u.test(letter)) ||
    /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path,
        message:
          "Use readable Roman-script text only; remove stray characters.",
      },
    ]);
  }
  if (
    !/[.!?]["'”’)]*$/u.test(text.trim()) ||
    /(?:\.{2,}|…)\s*["'”’)]*$/u.test(text.trim())
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path,
        message:
          "Write complete sentences with ending punctuation. Shorten by rewriting, never by cutting off text.",
      },
    ]);
  }
}
export function checkGeneratedContent(output: ModelOutput) {
  checkGeneratedCopy(output.bio.headline + ".", ["bio", "headline"]);
  checkGeneratedCopy(output.bio.about, ["bio", "about"]);
  output.products.forEach((product, index) => {
    checkGeneratedCopy(product.description, ["products", index, "description"]);
  });
}
export function repairModel(
  raw: unknown,
  expectedLanguage: Language,
): ModelOutput {
  const output = modelSchema.parse(raw);
  if (output.language !== expectedLanguage) {
    throw new Error("Return the requested language.");
  }
  output.products = output.products.map((p) => {
    const [min, max] = priceBand(p.format, output.niche);
    return {
      ...p,
      ready_to_sell: false,
      price_inr: Math.max(min, Math.min(max, p.price_inr)),
    };
  });
  checkCopy(output);
  if (output.input_quality === "ok") checkGeneratedContent(output);
  if (output.input_quality === "too_vague" && !output.clarifying_question) {
    throw new Error("Provide one clarifying question.");
  }
  return output;
}

export function creatorContext(
  input: Pick<GenerateInput, "description" | "offer_status" | "existing_offer">,
) {
  const description = input.description.trim();
  const offer =
    input.offer_status === "existing"
      ? (input.existing_offer ?? "").trim()
      : "";
  if (!offer) return description;
  if (!description) return offer;
  const lowerDescription = description.toLowerCase();
  const lowerOffer = offer.toLowerCase();
  if (lowerDescription.includes(lowerOffer)) return description;
  if (lowerOffer.includes(lowerDescription)) return offer;
  return `${description}. ${offer}`;
}
