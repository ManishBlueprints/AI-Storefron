import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ExternalLink,
  Globe2,
  Plus,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { api } from "../api";
import { beginSetupSession, setupProperties } from "../setup-session";
import { track } from "../analytics";
import { readLocal, tokenKey, writeLocal } from "../storage";
import {
  contentSchema,
  generateSchema,
  preflight,
  creatorContext,
  tokenSchema,
} from "../../shared/domain";
import type { Audience, Language } from "../../shared/domain";
import { errorText } from "../utils";
import { Header, Notice, Loading, Modal } from "../components";

interface InputDraft {
  description: string;
  audience: Audience;
  language: Language;
  handle: string;
  offerStatus: "existing" | "exploring" | null;
  existingOffer: string;
}
const initial: InputDraft = {
  description: "",
  audience: null,
  language: "en",
  handle: "",
  offerStatus: null,
  existingOffer: "",
};
const examples = [
  {
    name: "Fitness",
    icon: "↗",
    text: "I share quick home workouts for busy women who want to build a consistent fitness routine.",
  },
  {
    name: "Cooking",
    icon: "♨",
    text: "I teach students how to cook easy, affordable vegetarian meals in a small kitchen.",
  },
  {
    name: "Exam prep",
    icon: "✎",
    text: "I help first-time UPSC aspirants organise their study schedule and revise current affairs.",
  },
];
export default function InputScreen() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<InputDraft>(() => {
    const saved = readLocal<unknown>("sp:input", initial);
    if (!saved || typeof saved !== "object") return initial;
    const value = saved as Partial<InputDraft>;
    return {
      offerStatus:
        value.offerStatus === "existing" || value.offerStatus === "exploring"
          ? value.offerStatus
          : null,
      existingOffer:
        typeof value.existingOffer === "string"
          ? value.existingOffer.slice(0, 500)
          : "",
      description:
        typeof value.description === "string"
          ? value.description.slice(0, 1000)
          : "",
      handle: typeof value.handle === "string" ? value.handle.slice(0, 50) : "",
      audience: ["under_5k", "5k_25k", "25k_plus"].includes(
        value.audience ?? "",
      )
        ? value.audience!
        : null,
      language: value.language === "hinglish" ? "hinglish" : "en",
    };
  });
  const location = useLocation();
  const about = location.pathname !== "/setup/offers";
  const [confirmNew, setConfirmNew] = useState(() =>
    new URLSearchParams(location.search).has("new"),
  );
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setError("");
    stepHeading.current?.focus();
    window.scrollTo(0, 0);
  }, [about]);
  useEffect(() => {
    if (!about && !draft.description.trim()) {
      navigate("/setup/about", { replace: true });
    }
  }, [about, draft.description, navigate]);
  function cancelNew() {
    setConfirmNew(false);
    navigate("/setup/about", { replace: true });
  }
  function startFresh() {
    const blank = { ...initial };
    writeLocal("sp:input", blank);
    setDraft(blank);
    setError("");
    navigate("/setup/about", { replace: true });
    setConfirmNew(false);
  }
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(false);
  const pending = useRef(false);
  const recent = readLocal<string | null>("sp:recent", null);
  useEffect(() => {
    setStorageError(!writeLocal("sp:input", draft));
  }, [draft]);
  function startSetup() {
    const { session, started } = beginSetupSession();
    if (started) {
      track(
        "setup_started",
        { language: draft.language },
        setupProperties(session),
      );
      track(
        "input_started",
        { language: draft.language },
        setupProperties(session),
      );
    }
    return session;
  }
  const update = (value: Partial<InputDraft>) => {
    startSetup();
    setDraft((current) => ({ ...current, ...value }));
    setError("");
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !draft.description.trim()) return;
    if (about) {
      if (!generateSchema.shape.handle.safeParse(draft.handle).success) {
        setError(
          "Enter an Instagram username using letters, numbers, periods or underscores, or leave it blank.",
        );
        return;
      }
      startSetup();
      navigate("/setup/offers");
      return;
    }
    const session = startSetup();
    const gate = preflight(
      creatorContext({
        description: draft.description,
        offer_status: draft.offerStatus,
        existing_offer: draft.existingOffer,
      }),
    );
    if (gate) {
      setError(gate.clarifying_question);
      return;
    }
    const parsed = generateSchema.safeParse({
      ...setupProperties(session),
      offer_status: draft.offerStatus,
      ...(draft.offerStatus === "existing"
        ? { existing_offer: draft.existingOffer }
        : {}),
      description: draft.description,
      audience_size: draft.audience,
      language: draft.language,
      ...(draft.handle ? { handle: draft.handle } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    track("generate_requested", { language: draft.language });
    try {
      const result = await api.generate(parsed.data);
      if (result.input_quality !== "ok") {
        setError(
          result.clarifying_question ||
            "Please add a little more about what you do.",
        );
        track("generate_failed", { language: draft.language });
        return;
      }
      const content = contentSchema.parse(result.content);
      if (!tokenSchema.safeParse(result.edit_token).success)
        throw new Error("We couldn’t open the draft safely. Please retry.");
      writeLocal(tokenKey(result.slug), result.edit_token);
      writeLocal("sp:recent", result.slug);
      track("generate_succeeded", content);
      navigate(`/edit/${result.slug}#t=${result.edit_token}`, {
        state: { generated: true },
      });
    } catch (error) {
      setError(errorText(error));
      track("generate_failed", { language: draft.language });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Header />
      {busy && (
        <Modal
          title="Creating your storefront"
          close={() => {}}
          dismissible={false}
        >
          <Loading message="Preparing your private draft…" />
          <p className="generation-reassurance">
            Nothing goes live until you review and publish.
          </p>
        </Modal>
      )}
      {confirmNew && (
        <Modal title="Start a new store?" close={cancelNew}>
          <p className="dialog-copy">
            This clears the saved description, offer, audience and Instagram
            handle for this setup. Your existing stores and their private edit
            links are kept.
          </p>
          <div className="modal-footer">
            <button className="button secondary" onClick={cancelNew}>
              Keep saved details
            </button>
            <button className="button primary" onClick={startFresh}>
              Start with a blank form
            </button>
          </div>
        </Modal>
      )}
      <main className="onboarding">
        <nav className="setup-progress" aria-label="Storefront setup">
          <Link to="/setup/about" aria-current={about ? "step" : undefined}>
            1 · About you
          </Link>
          {about ? (
            <span>2 · Your offers</span>
          ) : (
            <span aria-current="step">2 · Your offers</span>
          )}
        </nav>
        <section className="input-panel">
          <form onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy} className="generation-fields">
              <div className="panel-heading">
                <span className="section-icon">
                  <WandSparkles size={19} />
                </span>
                <div>
                  <h1 ref={stepHeading} tabIndex={-1}>
                    {about
                      ? "First, a little about you"
                      : "What would you like to offer?"}
                  </h1>
                  <p>
                    {about
                      ? "Tell us what you know and who you help."
                      : "Bring your own idea, or let AI suggest a starting point."}
                  </p>
                </div>
              </div>
              {about && (
                <>
                  <label className="field-label" htmlFor="description">
                    What do you love sharing?
                  </label>
                  <div className="textarea-wrap">
                    <textarea
                      id="description"
                      maxLength={1000}
                      rows={4}
                      value={draft.description}
                      onChange={(e) => update({ description: e.target.value })}
                      placeholder="I’m a yoga instructor helping busy professionals find 20 minutes of calm in their day…"
                      aria-describedby="description-count"
                      required
                    />
                    <span className="char-counter" id="description-count">
                      {draft.description.length}/1000
                    </span>
                  </div>
                  <div className="examples">
                    <span>Need a little inspiration?</span>
                    <div>
                      {examples.map((example) => (
                        <button
                          type="button"
                          key={example.name}
                          onClick={() => update({ description: example.text })}
                        >
                          <span>{example.icon}</span>
                          {example.name}
                          <Plus size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {!about && (
                <>
                  <div className="field-group">
                    <label className="field-label" id="offer-status-label">
                      Do you already have something to sell?{" "}
                      <span>Optional</span>
                    </label>
                    <div
                      className="audience-options"
                      role="group"
                      aria-labelledby="offer-status-label"
                    >
                      {(
                        [
                          ["existing", "Yes, I have an offer"],
                          ["exploring", "Help me decide"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={draft.offerStatus === value}
                          className={
                            draft.offerStatus === value ? "selected" : ""
                          }
                          onClick={() =>
                            update({
                              offerStatus:
                                draft.offerStatus === value ? null : value,
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {draft.offerStatus === "existing" && (
                      <label className="editor-field">
                        <span>What do you already offer?</span>
                        <textarea
                          rows={2}
                          maxLength={500}
                          required
                          value={draft.existingOffer}
                          placeholder="For example, a 30-minute meal-planning session with a personal grocery list."
                          onChange={(event) =>
                            update({ existingOffer: event.target.value })
                          }
                        />
                        <small>
                          Tell us what’s actually included. We’ll improve how
                          you present it.
                        </small>
                      </label>
                    )}
                  </div>
                </>
              )}
              {about && (
                <>
                  <div className="language-field">
                    <div>
                      <label className="field-label" htmlFor="language">
                        Your store’s language
                      </label>
                      <div className="select-wrap">
                        <Globe2 size={16} />
                        <select
                          id="language"
                          value={draft.language}
                          onChange={(e) =>
                            update({ language: e.target.value as Language })
                          }
                        >
                          <option value="en">English</option>
                          <option value="hinglish">Hinglish</option>
                        </select>
                        <ChevronDown size={15} />
                      </div>
                    </div>
                  </div>
                  <div className="creator-context">
                    <div className="field-group">
                      <label className="field-label" id="audience-label">
                        How big is your community? <span>Optional</span>
                      </label>
                      <div
                        className="audience-options"
                        role="group"
                        aria-labelledby="audience-label"
                      >
                        {(
                          [
                            ["under_5k", "Under 5K"],
                            ["5k_25k", "5K to 25K"],
                            ["25k_plus", "25K+"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            type="button"
                            aria-pressed={draft.audience === value}
                            className={
                              draft.audience === value ? "selected" : ""
                            }
                            onClick={() =>
                              update({
                                audience:
                                  draft.audience === value ? null : value,
                              })
                            }
                            key={value}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>{" "}
                    <div>
                      <label className="field-label" htmlFor="handle">
                        Instagram handle <span>Optional</span>
                      </label>
                      <div className="handle-wrap">
                        <span>@</span>
                        <input
                          id="handle"
                          value={draft.handle.replace(/^@/, "")}
                          maxLength={50}
                          autoComplete="off"
                          placeholder="yourname"
                          onChange={(e) => update({ handle: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="helper" id="description-help">
                      Shown as a clickable link on your published store. We
                      don’t read your Instagram profile.
                    </p>
                  </div>
                </>
              )}
              {error && <Notice>{error}</Notice>}
              {storageError && (
                <Notice tone="info">
                  This browser can’t save drafts. Keep this tab open and save
                  your private edit link after generating.
                </Notice>
              )}
              <div className="setup-navigation">
                <Link
                  className="button secondary"
                  to={about ? "/" : "/setup/about"}
                >
                  Back
                </Link>
                <button
                  className="button primary generate-button"
                  disabled={!draft.description.trim()}
                  type="submit"
                >
                  {!about && <Sparkles size={18} />}
                  {about ? "Continue" : "Generate my storefront"}
                </button>
              </div>
              <p className="form-foot">
                <ShieldCheck size={14} /> No sign-up required. Review before you
                publish.
              </p>
              {recent && (
                <Link className="resume-link" to={`/edit/${recent}`}>
                  Continue your last store <ExternalLink size={13} />
                </Link>
              )}
            </fieldset>
          </form>
        </section>
      </main>
    </>
  );
}
