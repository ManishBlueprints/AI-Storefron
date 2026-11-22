import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  LockKeyhole,
  MessageCircle,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { track } from "../analytics";
import { Header, Notice, Loading, LoadError } from "../components";
import { useOwner } from "../useOwner";

export default function PublishedScreen() {
  const { slug, token, store, error, loading, retry } = useOwner();
  const [copied, setCopied] = useState(""),
    [copyError, setCopyError] = useState("");
  if (loading)
    return (
      <>
        <Header />
        <Loading message="Getting your share link ready…" />
      </>
    );
  if (error || !store)
    return (
      <>
        <Header />
        <LoadError error={error || "Store not found."} retry={retry} />
      </>
    );
  if (store.status !== "published")
    return (
      <>
        <Header />
        <div className="empty-state">
          <h1>One small step to go.</h1>
          <p>Your store is still a private draft.</p>
          <Link className="button primary" to={`/edit/${slug}#t=${token}`}>
            Finish and publish
          </Link>
        </div>
      </>
    );
  const publicUrl = `${location.origin}/s/${slug}`;
  const privateUrl = `${location.origin}/edit/${slug}#t=${token}`;
  async function copy(value: string, kind: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setCopyError("");
      setTimeout(() => setCopied(""), 2500);
      if (kind === "public")
        track("link_shared", store!.content, { method: "copy" });
    } catch {
      setCopyError(
        "Copy isn’t available in this browser. Select the link below and copy it manually.",
      );
    }
  }
  return (
    <>
      <Header />
      <main className="published">
        <div className="success-icon">
          <Check size={30} />
        </div>
        <span className="eyebrow">PUBLISHED SUCCESSFULLY</span>
        <h1>
          Your storefront.
          <br />
          <span>Ready to share.</span>
        </h1>
        <p>Copy your public link or share it with your audience.</p>
        <section className="share-card">
          <label className="field-label" htmlFor="public-link">
            <Globe2 size={15} /> Your public storefront
          </label>
          <div className="copy-field">
            <input
              id="public-link"
              value={publicUrl}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button
              className="icon-button"
              aria-label="Copy public link"
              onClick={() => copy(publicUrl, "public")}
            >
              {copied === "public" ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <a
            className="button whatsapp-button full-width"
            href={`https://wa.me/?text=${encodeURIComponent(`Explore my storefront: ${publicUrl}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              track("link_shared", store.content, { method: "whatsapp" })
            }
          >
            <MessageCircle size={18} />
            Share on WhatsApp
          </a>
        </section>
        <section className="private-card">
          <div className="card-heading">
            <LockKeyhole size={20} />
            <h2>Save your edit link</h2>
            <span>ONLY FOR YOU</span>
          </div>
          <p>
            Anyone with this link can edit your store. Keep it private and save
            it somewhere safe. If you lose it, you’ll lose access.
          </p>
          <div className="copy-field">
            <input
              aria-label="Private edit link"
              readOnly
              value={privateUrl}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="icon-button"
              aria-label="Copy private edit link"
              onClick={() => copy(privateUrl, "private")}
            >
              {copied === "private" ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
        </section>
        {copyError && <Notice>{copyError}</Notice>}
        <section className="stats-card">
          <div className="card-heading">
            <h2>Your store, so far</h2>
            <button
              className="icon-button"
              aria-label="Refresh statistics"
              onClick={retry}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="stats-grid">
            <div>
              <Eye size={19} />
              <strong>{store.views ?? 0}</strong>
              <span>Page views</span>
            </div>
          </div>
        </section>
        <div className="published-actions">
          <Link className="button secondary" to={`/edit/${slug}#t=${token}`}>
            <Pencil size={16} />
            Edit my store
          </Link>
          <Link className="button primary" to={`/s/${slug}`}>
            <ExternalLink size={16} />
            View public page
          </Link>
        </div>
      </main>
    </>
  );
}
