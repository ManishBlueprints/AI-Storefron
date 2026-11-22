import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Pencil,
} from "lucide-react";
import { api } from "../api";
import { activeSetupSession, markCreatorPublished } from "../setup-session";
import { track } from "../analytics";
import { readLocal, removeLocal, writeLocal } from "../storage";
import {
  contentSchema,
  formatLabels,
  formats,
  priceBand,
} from "../../shared/domain";
import type { Content, Language, Product } from "../../shared/domain";
import { money, errorText } from "../utils";
import { editorStep, restoreBlock } from "../editor-state";
import { Header, Notice, Loading, Modal, LoadError } from "../components";
import {
  SourceNotice,
  ProductCard,
  BioCard,
  BlockActions,
} from "../storefront-components";
import { useOwner } from "../useOwner";

function EditBlock({
  content,
  block,
  close,
  save,
  confirmDelivery = false,
}: {
  content: Content;
  block: string;
  close: () => void;
  save: (content: Content) => void;
  confirmDelivery?: boolean;
}) {
  const [next, setNext] = useState(() => structuredClone(content)),
    [error, setError] = useState("");
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  const product = next.products.find((p) => p.id === block);
  const updateProduct = (value: Partial<Product>) =>
    setNext((current) => ({
      ...current,
      products: current.products.map((p) =>
        p.id === block ? { ...p, ...value } : p,
      ),
    }));
  const band = product ? priceBand(product.format, next.niche) : null;
  const outside =
    product &&
    band &&
    product.price_inr !== 0 &&
    (product.price_inr < band[0] || product.price_inr > band[1]);
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    min: number,
    max: number,
    multiline = false,
  ) => (
    <label className="editor-field">
      <span>
        {label}
        <small>
          {value.length}/{max}
        </small>
      </span>
      {multiline ? (
        <textarea
          value={value}
          minLength={min}
          maxLength={max}
          rows={4}
          onChange={(e) => change(e.target.value)}
          required
        />
      ) : (
        <input
          value={value}
          minLength={min}
          maxLength={max}
          onChange={(e) => change(e.target.value)}
          required
        />
      )}
      {min > 1 && <small>At least {min} characters</small>}
    </label>
  );
  return (
    <Modal
      title={block === "bio" ? "Make your bio yours" : "Edit your product"}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = contentSchema.safeParse(next);
          if (!parsed.success) {
            setError(parsed.error.issues.map((i) => i.message).join(" · "));
            return;
          }
          if (confirmDelivery && !deliveryConfirmed) {
            setError(
              "Confirm you can deliver the updated offer before saving.",
            );
            return;
          }
          if (confirmDelivery)
            parsed.data.products = parsed.data.products.map((p) =>
              p.id === block ? { ...p, ready_to_sell: true } : p,
            );
          save(parsed.data);
        }}
      >
        {block === "bio" ? (
          <>
            {field(
              "Headline",
              next.bio.headline,
              (value) =>
                setNext((c) => ({ ...c, bio: { ...c.bio, headline: value } })),
              1,
              60,
            )}
            {field(
              "About you",
              next.bio.about,
              (value) =>
                setNext((c) => ({ ...c, bio: { ...c.bio, about: value } })),
              150,
              300,
              true,
            )}
          </>
        ) : (
          product && (
            <>
              {field(
                "Product title",
                product.title,
                (title) => updateProduct({ title }),
                1,
                60,
              )}
              <label className="editor-field">
                <span>Format</span>
                <select
                  value={product.format}
                  onChange={(e) =>
                    updateProduct({
                      format: e.target.value as Product["format"],
                      ...(e.target.value === "community"
                        ? { billing: "monthly" }
                        : {}),
                    })
                  }
                >
                  {formats.map((f) => (
                    <option
                      value={f}
                      key={f}
                      disabled={next.products.some(
                        (p) => p.id !== block && p.format === f,
                      )}
                    >
                      {formatLabels[f]}
                    </option>
                  ))}
                </select>
              </label>
              {field(
                "Description",
                product.description,
                (description) => updateProduct({ description }),
                120,
                280,
                true,
              )}
              <div className="form-row">
                <label className="editor-field">
                  <span>Price (INR)</span>
                  <input
                    type="number"
                    min={0}
                    max={10000000}
                    step={1}
                    value={product.price_inr}
                    onChange={(e) =>
                      updateProduct({ price_inr: Number(e.target.value) })
                    }
                    required
                  />
                </label>
                <label className="editor-field">
                  <span>Billing</span>
                  <select
                    value={product.billing}
                    disabled={product.format === "community"}
                    onChange={(e) =>
                      updateProduct({
                        billing: e.target.value as Product["billing"],
                      })
                    }
                  >
                    <option value="one_time">One time</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              </div>
              {outside && (
                <Notice tone="info">
                  Suggested starting range: {money(band![0])} to{" "}
                  {money(band![1])}. Keep {money(product.price_inr)}? You can —
                  it’s your call.
                </Notice>
              )}
              {field(
                "Why this price?",
                product.price_rationale,
                (price_rationale) => updateProduct({ price_rationale }),
                1,
                140,
              )}
            </>
          )
        )}
        {confirmDelivery && (
          <label className="readiness-control">
            <input
              type="checkbox"
              required
              checked={deliveryConfirmed}
              onChange={(event) => setDeliveryConfirmed(event.target.checked)}
            />
            <span>
              <strong>I can deliver this updated offer</strong>
              <small>
                Keep this offer included. Changes stay private until you
                publish.
              </small>
            </span>
          </label>
        )}
        {error && <Notice>{error}</Notice>}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            {confirmDelivery ? "Save offer" : "Keep changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function EditorScreen() {
  const {
    slug,
    token,
    store,
    setStore,
    error: loadError,
    loading,
    retry,
  } = useOwner();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [content, setContent] = useState<Content | null>(null);
  const [localSaved, setLocalSaved] = useState(true);
  const [baseRevision, setBaseRevision] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    scope: "all" | "bio" | "product";
    block?: string;
    language: Language;
  } | null>(null);
  const [previous, setPrevious] = useState<
    Record<string, Content["bio"] | Product>
  >(() => readLocal(`sp:history:${slug}`, {}));
  const [edited, setEdited] = useState<Set<string>>(
    () => new Set(readLocal<string[]>(`sp:edited:${slug}`, [])),
  );
  useEffect(() => {
    writeLocal(`sp:edited:${slug}`, [...edited]);
  }, [slug, edited]);
  useEffect(() => {
    writeLocal(`sp:history:${slug}`, previous);
  }, [slug, previous]);
  const mutation = useRef(false);
  useEffect(() => {
    if (!store) return;
    if (store.first_published_at) markCreatorPublished();
    const local = readLocal<{
      content: unknown;
      base_revision?: string;
      edited?: string[];
    } | null>(`sp:draft:${slug}`, null);
    const parsed = local && contentSchema.safeParse(local.content);
    if (
      local &&
      parsed &&
      parsed.success &&
      typeof local.base_revision === "string"
    ) {
      setContent(parsed.data);
      setBaseRevision(local.base_revision!);
      setDirty(true);
      setEdited(new Set(Array.isArray(local.edited) ? local.edited : []));
    } else {
      setContent(store.content);
      setBaseRevision(store.updated_at);
      setDirty(false);
    }
    // The initial server load hydrates local edits once; mutations update state directly.
  }, [slug, store?.slug]);
  useEffect(() => {
    if (content && dirty)
      setLocalSaved(
        writeLocal(`sp:draft:${slug}`, {
          content,
          base_revision: baseRevision,
          edited: [...edited],
        }),
      );
  }, [content, dirty, edited, slug, baseRevision]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!content) return;
    const id = requestAnimationFrame(() => {
      document.getElementById("workflow-heading")?.focus();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(id);
  }, [searchParams, Boolean(content)]);
  useEffect(() => {
    if (error) document.querySelector<HTMLElement>(".workflow-error")?.focus();
  }, [error]);
  useEffect(() => {
    const requested = searchParams.get("step");
    if (
      content &&
      !content.products.some((p) => p.ready_to_sell) &&
      (requested === "preview" || requested === "publish")
    ) {
      navigate(
        { search: "?step=review", hash: window.location.hash },
        { replace: true },
      );
    }
  }, [content, searchParams, navigate]);
  if (loading || (store && !content))
    return (
      <>
        <Header />
        <Loading message="Opening your store…" />
      </>
    );
  if (loadError || !store || !content)
    return (
      <>
        <Header />
        <LoadError
          error={loadError || "Your store couldn’t be loaded."}
          retry={retry}
        />
      </>
    );
  const readyCount = content.products.filter(
    (product) => product.ready_to_sell,
  ).length;
  const step = editorStep(store.status, searchParams.get("step"), readyCount);
  const selectedProducts = content.products.filter(
    (product) => product.ready_to_sell,
  );
  const goTo = (next: string) => {
    setError("");
    navigate({ search: `?step=${next}`, hash: window.location.hash });
  };
  const saveCurrent = async () => {
    if (!baseRevision) throw new Error("Reload your store before saving.");
    const saved = await api.save(slug, token, content, baseRevision);
    setStore(saved);
    setContent(saved.content);
    setBaseRevision(saved.updated_at);
    setDirty(false);
    removeLocal(`sp:draft:${slug}`);
    return saved;
  };
  async function save() {
    if (mutation.current) return;
    mutation.current = true;
    setBusy("Saving your changes…");
    setError("");
    try {
      await saveCurrent();
    } catch (error) {
      setError(errorText(error));
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }
  async function publish() {
    if (mutation.current) return;
    if (!readyCount) {
      setError(
        "Review your offers and mark at least one ready to deliver before publishing. Other ideas can stay as drafts.",
      );
      goTo("review");
      return;
    }
    mutation.current = true;
    setBusy("Publishing your store…");
    setError("");
    try {
      const saved = await saveCurrent();
      const currentSession = activeSetupSession(Date.now(), true);
      const result = await api.publish(
        slug,
        token,
        saved.updated_at,
        currentSession?.id,
      );
      track("store_published", result.content, result.publication);
      if (result.publication?.first_publish)
        track("store_first_published", result.content, result.publication);
      markCreatorPublished();
      navigate(`/published/${slug}#t=${token}`);
    } catch (error) {
      setError(errorText(error));
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }
  const takeSnapshot = (scope: string, block?: string) => {
    const snapshot: Record<string, Content["bio"] | Product> = {};
    if (scope === "all" || scope === "bio")
      snapshot.bio = structuredClone(content.bio);
    if (scope === "all")
      content.products.forEach((p) => {
        snapshot[p.id] = structuredClone(p);
      });
    if (block) {
      const p = content.products.find((p) => p.id === block);
      if (p) snapshot[block] = structuredClone(p);
    }
    setPrevious((old) => ({ ...old, ...snapshot }));
  };
  async function regenerate(
    scope: "all" | "bio" | "product",
    language: Language,
    block?: string,
  ) {
    if (mutation.current) return;
    mutation.current = true;
    setConfirmation(null);
    setBusy("Finding a fresh take…");
    setError("");
    try {
      let revision = baseRevision;
      if (dirty) revision = (await saveCurrent()).updated_at;
      if (!revision) throw new Error("Reload your store before regenerating.");
      const saved = await api.regenerate(
        slug,
        token,
        scope,
        language,
        revision,
        block,
      );
      takeSnapshot(scope, block);
      setStore(saved);
      setContent(saved.content);
      setBaseRevision(saved.updated_at);
      setDirty(false);
      removeLocal(`sp:draft:${slug}`);
      setEdited(
        (current) =>
          new Set(
            [...current].filter((id) =>
              scope === "all" ? false : id !== (block || "bio"),
            ),
          ),
      );
      track("section_regenerated", saved.content, { scope });
    } catch (error) {
      setError(errorText(error));
    } finally {
      mutation.current = false;
      setBusy("");
    }
  }
  function requestRegenerate(
    scope: "all" | "bio" | "product",
    language: Language,
    block?: string,
  ) {
    if (scope === "all" || edited.has(block || "bio"))
      setConfirmation({ scope, language, block });
    else void regenerate(scope, language, block);
  }
  function restore(block: string) {
    const value = previous[block];
    if (!value || !content) return;
    try {
      setContent(restoreBlock(content, block, value));
      setError("");
    } catch (error) {
      setError(errorText(error));
      return;
    }
    setPrevious((current) => {
      const next = { ...current };
      delete next[block];
      return next;
    });
    setDirty(true);
    setEdited((current) => new Set(current).add(block));
  }
  const actions = (block: string) => (
    <BlockActions
      label={
        block === "bio"
          ? "bio"
          : content.products.find((p) => p.id === block)?.title || "product"
      }
      disabled={Boolean(busy)}
      edit={() => setEditing(block)}
      regenerate={() =>
        requestRegenerate(
          block === "bio" ? "bio" : "product",
          content.language,
          block === "bio" ? undefined : block,
        )
      }
      restore={previous[block] ? () => restore(block) : undefined}
    />
  );
  const previewEdit = (block: string) => (
    <div className="block-actions">
      <button
        className="icon-button"
        disabled={Boolean(busy)}
        aria-label={
          block === "bio"
            ? "Edit bio"
            : `Edit ${content.products.find((p) => p.id === block)?.title || "offer"}`
        }
        onClick={() => setEditing(block)}
      >
        <Pencil size={16} />
        <span>Edit</span>
      </button>
    </div>
  );
  const errorNotice = error && (
    <div className="workflow-error" tabIndex={-1}>
      <Notice>
        <div>
          {error}
          {error.toLowerCase().includes("reload") && (
            <button
              className="button secondary"
              onClick={() => {
                if (
                  window.confirm(
                    "Discard your unsaved edits and load the latest saved store?",
                  )
                ) {
                  removeLocal(`sp:draft:${slug}`);
                  location.reload();
                }
              }}
            >
              Reload latest saved version
            </button>
          )}
        </div>
      </Notice>
    </div>
  );
  const offerCards = (
    <div className="review-offers">
      {content.products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          index={i}
          preview
          actions={actions(product.id)}
          disabled={Boolean(busy)}
          onReadinessChange={(ready) => {
            setError("");
            setContent((current) =>
              current
                ? {
                    ...current,
                    products: current.products.map((p) =>
                      p.id === product.id ? { ...p, ready_to_sell: ready } : p,
                    ),
                  }
                : current,
            );
            setDirty(true);
            setEdited((current) => new Set(current).add(product.id));
            track("field_edited", content, { field: "offer_readiness" });
          }}
        />
      ))}
    </div>
  );
  return (
    <>
      <Header />
      <main className={`workflow workflow-${step}`}>
        <div className="workflow-topline">
          {step === "manage" ? (
            <Link to="/" className="back-link">
              <ChevronLeft size={15} /> Builder
            </Link>
          ) : (
            <span className="eyebrow">PRIVATE DRAFT</span>
          )}
          <span className="draft-status" role="status">
            {dirty
              ? localSaved
                ? "Draft saved on this device"
                : "Unsaved changes"
              : "Draft saved"}
          </span>
        </div>
        {step !== "manage" && (
          <ol className="setup-steps" aria-label="Store setup progress">
            {[
              ["review", "Review offers"],
              ["preview", "Preview"],
              ["publish", "Publish"],
            ].map(([key, label], i) => (
              <li key={key} aria-current={step === key ? "step" : undefined}>
                <span>{i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}
        <div className="workflow-heading">
          <h1 id="workflow-heading" tabIndex={-1}>
            {step === "review"
              ? "Which offers can you deliver?"
              : step === "preview"
                ? "See your store before you share."
                : step === "publish"
                  ? "Ready to publish your store?"
                  : "Manage your storefront."}
          </h1>
          <p>
            {step === "review"
              ? "Choose at least one offer you’re ready to deliver. Other ideas stay private."
              : step === "preview"
                ? "This is how your selected offers will look. Nothing is live until you publish."
                : step === "publish"
                  ? "Publish your selected offers and get a link you can share."
                  : "Edit your draft here. Your published version stays live until you publish an update."}
          </p>
        </div>
        {(step === "review" || step === "manage") && (
          <SourceNotice content={content} />
        )}
        {dirty && !localSaved && (
          <Notice tone="info">
            This browser couldn’t save your edits on this device. Keep this page
            open until you save or publish.
          </Notice>
        )}
        {errorNotice}
        {busy && (
          <Notice tone="info">
            <LoaderCircle className="spin" size={17} />
            {busy}
          </Notice>
        )}
        {(step === "review" || step === "manage") && (
          <>
            {step === "manage" && (
              <div className="manage-actions">
                <button
                  className="button secondary"
                  disabled={Boolean(busy) || !dirty}
                  onClick={save}
                >
                  {dirty ? "Save draft" : "Draft saved"}
                </button>

                <Link
                  className="button secondary"
                  to={`/published/${slug}#t=${token}`}
                >
                  View link & stats <ExternalLink size={14} />
                </Link>
                <button
                  className="button primary"
                  disabled={Boolean(busy) || !readyCount}
                  onClick={() => goTo("preview")}
                >
                  Preview update
                </button>
              </div>
            )}
            <section className="review-bio" aria-label="Write your bio">
              <div>
                <span className="eyebrow">WRITE YOUR BIO</span>
                <h2>{content.bio.headline}</h2>
                <p>{content.bio.about}</p>
              </div>
              {actions("bio")}
            </section>
            <div className="review-count" id="offers-review">
              <h2>Your offers</h2>
              <span>
                {readyCount} selected · {content.products.length} ideas
              </span>
            </div>
            {offerCards}
            <details className="draft-tools">
              <summary>More draft options</summary>
              <p>
                Generate a new draft or change its language. Review regenerated
                offers before including them.
              </p>
              <div className="manage-actions">
                <label>
                  Store language
                  <select
                    disabled={Boolean(busy)}
                    value={content.language}
                    onChange={(e) =>
                      requestRegenerate("all", e.target.value as Language)
                    }
                  >
                    <option value="en">English</option>
                    <option value="hinglish">Hinglish</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => requestRegenerate("all", content.language)}
                >
                  Regenerate whole draft
                </button>
              </div>
            </details>
          </>
        )}
        {step === "preview" && (
          <>
            <div className="buyer-preview public-store">
              <BioCard
                instagramHandle={store.instagram_handle}
                content={content}
                headingLevel={2}
                actions={previewEdit("bio")}
              />
              <div className="products-heading">
                <h2>Explore my offers</h2>
                <span>
                  {readyCount} {readyCount === 1 ? "offer" : "offers"}
                </span>
              </div>
              <div className="product-grid">
                {selectedProducts.map((product, i) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={i}
                    actions={previewEdit(product.id)}
                  />
                ))}
              </div>
              <p className="helper">
                Preview only. Your changes stay private until you publish.
              </p>
            </div>
          </>
        )}
        {step === "publish" && (
          <section className="publish-setup" aria-label="Publishing settings">
            <div className="launch-summary">
              <h2>Ready to publish</h2>
              <p>
                {readyCount} {readyCount === 1 ? "offer" : "offers"} will be
                public. {content.products.length - readyCount} private draft{" "}
                {content.products.length - readyCount === 1 ? "idea" : "ideas"}{" "}
                will stay hidden.
              </p>
              {store.status === "published" && (
                <p>This will replace your current published version.</p>
              )}
            </div>
          </section>
        )}
      </main>
      {step !== "manage" && (
        <footer className="workflow-footer">
          <div>
            {step !== "review" ? (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => goTo(step === "preview" ? "review" : "preview")}
              >
                Back
              </button>
            ) : store.status === "published" ? (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() => goTo("manage")}
              >
                Back to editor
              </button>
            ) : (
              <span className="helper">
                Only selected offers will be public.
              </span>
            )}
            <button
              className="button primary"
              disabled={Boolean(busy) || !readyCount}
              onClick={() =>
                step === "publish"
                  ? void publish()
                  : goTo(step === "review" ? "preview" : "publish")
              }
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : step === "publish" ? (
                <Globe2 size={17} />
              ) : null}
              {step === "review"
                ? "Continue to preview"
                : step === "preview"
                  ? "Continue to publish"
                  : store.status === "published"
                    ? "Publish update"
                    : "Publish storefront"}
            </button>
          </div>
        </footer>
      )}
      {editing && (
        <EditBlock
          content={content}
          block={editing}
          confirmDelivery={step === "preview" && editing !== "bio"}
          close={() => setEditing(null)}
          save={(next) => {
            takeSnapshot(
              editing === "bio" ? "bio" : "product",
              editing === "bio" ? undefined : editing,
            );
            if (editing !== "bio") {
              const original = content.products.find(
                (product) => product.id === editing,
              );
              next.products = next.products.map((product) =>
                product.id === editing &&
                JSON.stringify(product) !== JSON.stringify(original)
                  ? {
                      ...product,
                      ready_to_sell:
                        step === "preview" && product.ready_to_sell,
                    }
                  : product,
              );
            }
            setContent(next);
            setDirty(true);
            setEdited((current) => new Set(current).add(editing));
            track("field_edited", next, {
              field: editing === "bio" ? "bio" : "product",
            });
            setEditing(null);
          }}
        />
      )}
      {confirmation && (
        <Modal title="Replace your edits?" close={() => setConfirmation(null)}>
          <p className="dialog-copy">
            {confirmation.scope === "all"
              ? "This replaces your draft bio and all offer ideas. You’ll need to review and select regenerated offers again. Your published version stays live."
              : "This replaces the selected section."}{" "}
            {confirmation.language !== content.language
              ? "Switching language regenerates the entire store."
              : "Regenerating will replace your edited text."}{" "}
            You can use Restore previous to go back one step.
          </p>
          <div className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setConfirmation(null)}
            >
              Keep my edits
            </button>
            <button
              className="button primary"
              onClick={() =>
                regenerate(
                  confirmation.scope,
                  confirmation.language,
                  confirmation.block,
                )
              }
            >
              Create a fresh take
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
