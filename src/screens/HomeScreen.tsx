import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  MessageCircle,
  Sparkles,
  Link2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Header } from "../components";
import StoreIllustration from "../StoreIllustration";
import { readLocal } from "../storage";

export default function HomeScreen() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    },
    [],
  );

  const saved = readLocal<Record<string, unknown> | null>("sp:input", null);
  const hasSetup = Boolean(
    saved &&
    (saved.description ||
      saved.handle ||
      saved.audience ||
      saved.offerStatus ||
      saved.existingOffer),
  );
  const recent = readLocal<string | null>("sp:recent", null);
  return (
    <>
      <Header />
      <main className="landing home-landing">
        <section className="landing-title">
          <span className="eyebrow">
            <span /> YOUR AI STOREFRONT BUILDER
          </span>
          <h1>
            Turn your expertise
            <br />
            <span>into your next business.</span>
          </h1>
          <p>
            Create a bio, discover offers, and set your starting prices.
            <br className="desktop-break" /> Review your draft, then publish a
            link to share.
          </p>
          <div className="home-start-actions">
            <Link
              className={`button home-start${starting ? " is-starting" : ""}`}
              to="/setup/about"
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                if (navigationTimer.current) return;
                if (
                  window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ) {
                  navigate("/setup/about");
                  return;
                }
                setStarting(true);
                navigationTimer.current = setTimeout(
                  () => navigate("/setup/about"),
                  500,
                );
              }}
            >
              <span className="home-start-icon" aria-hidden="true">
                <ArrowRight size={26} strokeWidth={1.7} />
              </span>
              <span className="home-start-label">Get Started</span>
            </Link>
            {hasSetup && (
              <Link className="home-new" to="/setup/about?new=1">
                Start new store
              </Link>
            )}
          </div>
          <span className="home-reassurance">
            No sign-up required. Nothing goes live until you publish.
          </span>
        </section>
        <section className="home-example">
          <div className="home-example-copy">
            <span className="eyebrow">A HOME FOR YOUR EXPERTISE</span>
            <h2>
              Your ideas.
              <br />A storefront of your own.
            </h2>
            <p>
              Start with what you know. Get a draft bio, offer ideas and
              suggested ₹ prices, then edit every detail to make it yours.
            </p>
            {recent && (
              <Link className="resume-link" to={`/edit/${recent}`}>
                Open your last store <ExternalLink size={13} />
              </Link>
            )}
            <span className="helper">
              Illustrative preview · Your draft will reflect your input.
            </span>
          </div>
          <StoreIllustration />
        </section>
        <section className="how-it-works" id="how-it-works">
          <div>
            <span className="step-icon">
              <MessageCircle size={18} />
            </span>
            <h3>A little about you</h3>
            <p>Tell us what you know and who you help.</p>
          </div>
          <div>
            <span className="step-icon">
              <Sparkles size={18} />
            </span>
            <h3>A store that feels like you</h3>
            <p>Review your bio, offers and suggested prices.</p>
          </div>
          <div>
            <span className="step-icon">
              <Link2 size={18} />
            </span>
            <h3>Publish and share</h3>
            <p>Choose your offers and share your public link.</p>
          </div>
        </section>
        <footer className="landing-footer">
          <span>Built for creators.</span>
          <span>Powered by AI. Reviewed by you. ✦</span>
        </footer>
      </main>
    </>
  );
}
