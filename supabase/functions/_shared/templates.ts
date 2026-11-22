import { contentSchema, detectNiche, priceBand } from "./domain.ts";
import type { Audience, Content, Format, Language, Niche } from "./domain.ts";

const topics: Record<
  Niche,
  {
    topic: string;
    hi: string;
    guide: string;
    session: string;
    formats: [Format, Format];
  }
> = {
  fitness: {
    topic: "everyday movement",
    hi: "roz ki movement",
    guide: "Your Everyday Movement Plan",
    session: "Move Together Club",
    formats: ["ebook", "community"],
  },
  finance: {
    topic: "personal budgeting",
    hi: "apne budget",
    guide: "Your First Budget Workbook",
    session: "Monthly Money Planner",
    formats: ["ebook", "template_pack"],
  },
  cooking: {
    topic: "simple home cooking",
    hi: "ghar ke simple khane",
    guide: "Everyday Kitchen Recipe Guide",
    session: "Your Weekly Meal Planner",
    formats: ["ebook", "template_pack"],
  },
  exam_prep: {
    topic: "consistent exam preparation",
    hi: "regular exam preparation",
    guide: "Your Study Routine Guide",
    session: "Weekly Revision Planner",
    formats: ["ebook", "template_pack"],
  },
  astrology: {
    topic: "reflective astrology",
    hi: "astrology aur reflection",
    guide: "Personal Reflection Session",
    session: "Your Astrology Journal",
    formats: ["one_on_one", "ebook"],
  },
  other: {
    topic: "sharing a useful skill",
    hi: "apni skill share karne",
    guide: "Your Practical Starter Guide",
    session: "Your Getting Started Toolkit",
    formats: ["ebook", "template_pack"],
  },
};
export function templateContent(
  description: string,
  language: Language,
  audience: Audience = null,
  offerStatus: "existing" | "exploring" | null = null,
  existingOffer?: string,
): Content {
  const niche = detectNiche(description),
    t = topics[niche];
  const ratio = audience === "25k_plus"
    ? 0.85
    : audience === "5k_25k"
    ? 0.45
    : audience === "under_5k"
    ? 0
    : 0.2;
  return contentSchema.parse({
    niche,
    language,
    source: "template",
    bio: language === "en"
      ? {
        headline: `A fresh start with ${t.topic}`,
        about:
          `Welcome to my space for ${t.topic}. I’m putting together practical resources to help you take a small next step at your own pace. Explore the offers below for practical ways to learn and take the next step.`,
      }
      : {
        headline: `${t.hi} ke liye ek nayi shuruaat`,
        about:
          `Mere ${t.hi} wale space mein welcome! Yahan main useful resources aur simple ideas ek jagah laane ki taiyaari kar raha hoon. Apne pace par shuru karein, neeche ideas dekhein aur apne goals ke liye sahi agla step chunein.`,
      },
    products: (offerStatus === "exploring"
      ? (["one_on_one", "community"] as const)
      : t.formats).map((format, i) => {
        const [min, max] = priceBand(format, niche);
        return {
          id: `p${i + 1}`,
          title: offerStatus === "existing" && i === 0
            ? "Your Existing Offer"
            : offerStatus === "exploring"
            ? `${t.topic} ${i === 0 ? "Starter Session" : "Q&A Circle"}`
            : i === 0
            ? t.guide
            : t.session,
          ready_to_sell: false,
          format,
          price_inr: Math.round(min + (max - min) * ratio),
          billing: format === "community" ? "monthly" : "one_time",
          description: offerStatus === "existing" &&
              i === 0 &&
              existingOffer &&
              language === "en"
            ? `A draft based on your existing offer: ${
              existingOffer.slice(0, 80)
            }. Review the scope, format, pricing, and exact contents before publishing, so buyers know what you can deliver.`
            : language === "en"
            ? `An editable starter idea for ${t.topic}, with space for your own approach, useful examples, and next steps. Review the proposed scope and choose the approach that fits your learning goals.`
            : `${t.hi} ke liye ek starter idea: apna approach, useful examples aur next steps yahan add karein. Apne goals ke hisaab se scope, useful examples aur agla step review karke apne liye sahi approach chunein.`,
          price_rationale: language === "en"
            ? "A suggested starting price. Adjust it for your time, delivery scope, and audience."
            : "Yeh starting price hai. Apne time aur resource ki value ke hisaab se change karein.",
        };
      }),
  });
}
