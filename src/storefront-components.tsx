import { useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  CircleHelp,
  MessageCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Store as StoreIcon,
} from "lucide-react";
import { formatLabels } from "../supabase/functions/_shared/domain";
import type { Content, Product } from "../supabase/functions/_shared/domain";
import { money } from "./utils";
import { Notice } from "./components";

export function SourceNotice({ content }: { content: Content }) {
  return content.source === "template" ? (
    <Notice tone="info">
      <Sparkles size={17} />
      <span>
        Here’s a starter you can edit. AI wasn’t available for this version, so
        these are template ideas. Make sure the details match what you offer.
      </span>
    </Notice>
  ) : null;
}
const productColors = ["peach", "lilac", "mint", "sky"];
export function ProductCard({
  product,
  index,
  actions,
  preview = false,
  onReadinessChange,
  disabled = false,
}: {
  product: Product;
  index: number;
  actions?: ReactNode;
  preview?: boolean;
  onReadinessChange?: (ready: boolean) => void;
  disabled?: boolean;
}) {
  const [why, setWhy] = useState(false);
  return (
    <article className="product-card">
      <div className={`product-art ${productColors[index % 4]}`}>
        <span className="art-orbit" />
        {product.format === "one_on_one" || product.format === "community" ? (
          <MessageCircle size={35} strokeWidth={1.4} />
        ) : (
          <BookOpen size={35} strokeWidth={1.4} />
        )}
        <span className="art-spark">✳</span>
        <span className="format-tag">{formatLabels[product.format]}</span>
      </div>
      <div className="product-content">
        <div className="product-title">
          <h3>{product.title}</h3>
          {actions}
        </div>
        <p className="product-description">{product.description}</p>
        <div className="product-price">
          <strong>
            {money(product.price_inr)}
            <small>{product.billing === "monthly" ? " / month" : ""}</small>
          </strong>
          {preview && (
            <button
              className="why-chip"
              type="button"
              aria-expanded={why}
              onClick={() => setWhy((v) => !v)}
            >
              <CircleHelp size={12} /> Why {money(product.price_inr)}?
            </button>
          )}
        </div>
        {why && preview && (
          <p className="rationale">{product.price_rationale}</p>
        )}
        {preview && onReadinessChange && (
          <label className="readiness-control">
            <input
              type="checkbox"
              aria-label={`${product.title}: ready to deliver`}
              checked={product.ready_to_sell}
              disabled={disabled}
              onChange={(event) => onReadinessChange(event.target.checked)}
            />
            <span>
              <strong>Include this offer</strong>
              <small>
                {product.ready_to_sell
                  ? "I’m ready to deliver this offer."
                  : "Draft idea — stays private until ready."}
              </small>
            </span>
          </label>
        )}
      </div>
    </article>
  );
}
export function BioCard({
  content,
  actions,
  headingLevel = 1,
}: {
  content: Content;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section className="bio-card">
      <div className="bio-cover">
        <span>✦</span>
        <span>✳</span>
        <i />
      </div>
      <div className="bio-avatar">
        <StoreIcon size={29} />
      </div>
      <div className="bio-body">
        <div className="bio-heading">
          <span className="tiny-label">WELCOME TO MY STOREFRONT</span>
          {actions}
        </div>
        <Heading className="store-headline">{content.bio.headline}</Heading>
        <p>{content.bio.about}</p>
      </div>
    </section>
  );
}
export function BlockActions({
  label,
  edit,
  regenerate,
  restore,
  disabled,
}: {
  label: string;
  edit: () => void;
  regenerate: () => void;
  restore?: () => void;
  disabled: boolean;
}) {
  return (
    <div className="block-actions">
      <button
        className="icon-button"
        disabled={disabled}
        aria-label={`Edit ${label}`}
        title={`Edit ${label}`}
        onClick={edit}
      >
        <Pencil size={16} />
        <span>Edit</span>
      </button>
      <button
        className="icon-button"
        disabled={disabled}
        aria-label={`Regenerate ${label}`}
        title={`Regenerate ${label}`}
        onClick={regenerate}
      >
        <RefreshCw size={16} />
        <span>Regenerate</span>
      </button>
      {restore && (
        <button
          className="icon-button"
          disabled={disabled}
          aria-label={`Restore previous ${label}`}
          title="Restore previous"
          onClick={restore}
        >
          <RotateCcw size={16} />
          <span>Restore</span>
        </button>
      )}
    </div>
  );
}
