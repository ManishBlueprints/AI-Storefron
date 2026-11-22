import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Heart,
  Sparkles,
  Store as StoreIcon,
  WandSparkles,
  X,
} from "lucide-react";

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="SuperProfile home">
      <img
        src="/brand/superprofile.svg"
        alt="SuperProfile"
        width="201"
        height="64"
      />
    </Link>
  );
}
export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <Brand />
        <span className="header-tag">
          <Sparkles size={14} /> AI Storefront Generator
        </span>
        <a className="header-link" href="/#how-it-works">
          Made for creators <Heart size={14} />
        </a>
      </div>
    </header>
  );
}
export function Notice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "info" | "success";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Loading({
  message = "Generating your storefront…",
}: {
  message?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-orbit">
        <WandSparkles size={32} />
        <i />
      </div>
      <h2>{message}</h2>
      <p>
        {slow
          ? "Still working. Your draft will be ready shortly."
          : "Creating your bio, offer ideas and suggested prices."}
      </p>
      <div className="loading-dots">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) close();
      }}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) close();
      }}
    >
      <div className="modal-title">
        <h2 id={titleId}>{title}</h2>
        {dismissible && (
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}

export function LoadError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <StoreIcon size={28} />
      </span>
      <h1>Let’s try that again.</h1>
      <p>{error}</p>
      <button className="button primary" onClick={retry}>
        Try again
      </button>
      <Link to="/">Create a new store</Link>
    </div>
  );
}
