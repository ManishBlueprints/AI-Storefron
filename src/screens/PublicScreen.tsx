import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../api";
import type { Store } from "../api";
import { track } from "../analytics";
import { errorText } from "../utils";
import { Brand, Loading, LoadError } from "../components";
import { ProductCard, BioCard } from "../storefront-components";

export default function PublicScreen() {
  const { slug = "" } = useParams();
  const [store, setStore] = useState<Store | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const viewed = useRef("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .public(slug)
      .then((result) => {
        if (cancelled) return;
        setStore(result);
        if (viewed.current !== slug) {
          viewed.current = slug;
          void api.track(slug, "view");
          track("page_viewed", result.content);
        }
      })
      .catch((error) => {
        if (!cancelled)
          setError(
            error instanceof ApiError && error.status === 404
              ? "This store hasn’t been published yet, or this link isn’t quite right. Ask the creator for their latest link."
              : errorText(error),
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, revision]);
  useEffect(() => {
    if (store) document.title = `${store.content.bio.headline} · SuperProfile`;
    return () => {
      document.title = "AI Storefront Generator · SuperProfile";
    };
  }, [store]);
  if (loading)
    return (
      <div className="public-page">
        <Loading message="Loading storefront…" />
      </div>
    );
  if (error || !store)
    return (
      <div className="public-page">
        <Brand />
        <LoadError
          error={error || "Store not found."}
          retry={() => setRevision((v) => v + 1)}
        />
      </div>
    );
  return (
    <div className="public-page">
      <div className="public-top">
        <Link to="/" aria-label="Create your own storefront">
          <img
            src="/brand/superprofile.svg"
            alt="SuperProfile"
            width="201"
            height="64"
          />
        </Link>
        <span>CREATED WITH SUPERPROFILE</span>
      </div>
      <main className="public-store">
        <BioCard
          content={store.content}
          instagramHandle={store.instagram_handle}
        />
        <div className="products-heading">
          <h2>Explore my offers</h2>
          <span>
            {store.content.products.length}{" "}
            {store.content.products.length === 1 ? "offering" : "offerings"}
          </span>
        </div>
        <div className="product-grid">
          {store.content.products.map((product, i) => (
            <ProductCard key={product.id} index={i} product={product} />
          ))}
        </div>
      </main>
      <footer className="public-footer">
        <span>Made with</span>
        <Brand />
        <Link to="/">
          Create your own store <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
