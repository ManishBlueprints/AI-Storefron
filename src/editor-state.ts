import { contentSchema } from "../shared/domain";
import type { Content, Product } from "../shared/domain";

export function restoreBlock(
  content: Content,
  block: string,
  value: Content["bio"] | Product,
): Content {
  if (
    block !== "bio" &&
    !content.products.some((product) => product.id === block)
  ) {
    throw new Error(
      "This product is no longer in your store. Your current version has been kept.",
    );
  }
  const candidate =
    block === "bio"
      ? { ...content, bio: value }
      : {
          ...content,
          products: content.products.map((product) =>
            product.id === block ? value : product,
          ),
        };
  const parsed = contentSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      "This previous version conflicts with your current product formats. Choose a different format for the conflicting product first. Your current version has been kept.",
    );
  }
  return parsed.data;
}

export type EditorStep = "review" | "preview" | "manage";

export function editorStep(
  status: "draft" | "published",
  requested: string | null,
  readyCount: number,
): EditorStep {
  if (requested === "review") return "review";
  if (requested === "preview" || requested === "publish")
    return readyCount > 0 ? "preview" : "review";
  return status === "published" ? "manage" : "review";
}
