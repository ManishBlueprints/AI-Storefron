import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { api } from "./api";
import type { OwnedStore } from "./api";
import { readLocal, tokenKey } from "./storage";
import { tokenSchema } from "../shared/domain";
import { errorText } from "./utils";
import { verifyOwnerAccess } from "./owner-access";

export function useOwner() {
  const { slug = "" } = useParams();
  const routeLocation = useLocation();
  const token =
    new URLSearchParams(routeLocation.hash.slice(1)).get("t") ||
    readLocal<string>(tokenKey(slug), "");
  const [store, setStore] = useState<OwnedStore | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setStore(null);
    if (!tokenSchema.safeParse(token).success) {
      setError(
        "You’ll need your private edit link to open this store. It looks like /edit/your-store#t=YOUR_TOKEN.",
      );
      setLoading(false);
      return;
    }
    verifyOwnerAccess(slug, token, api.owner)
      .then(({ store, persisted }) => {
        if (cancelled) return;
        if (persisted && location.hash)
          history.replaceState(
            history.state,
            "",
            location.pathname + location.search,
          );
        setStore(store);
      })
      .catch((error) => {
        if (!cancelled) setError(errorText(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, token, revision]);
  return {
    slug,
    token,
    store,
    setStore,
    error,
    loading,
    retry: () => setRevision((v) => v + 1),
  };
}
