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
  generateSchema,
  preflight,
  creatorContext,
  detectNiche,
  focusSuggestions,
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
  tags: string[];
  clarificationAnswer: string;
  checkedContext: string;
}
const initial: InputDraft = {
  description: "",
  audience: null,
  language: "en",
  handle: "",
  offerStatus: null,
  existingOffer: "",
  tags: [],
  clarificationAnswer: "",
  checkedContext: "",
};
const audienceTags = ["Beginners", "Busy professionals", "Students", "Women"];
interface Clarification {
  question: string;
  options: string[];
  answer: string;
}
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
      clarificationAnswer:
        typeof value.clarificationAnswer === "string"
          ? value.clarificationAnswer.slice(0, 120)
          : "",
      checkedContext:
        typeof value.checkedContext === "string" ? value.checkedContext : "",
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
      tags: Array.isArray(value.tags)
        ? value.tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 5)
        : [],
    };
  });
  const location = useLocation();
  const about = location.pathname !== "/setup/offers";
  const [confirmNew, setConfirmNew] = useState(() =>
    new URLSearchParams(location.search).has("new"),
  );
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeading.current?.focus();
    window.scrollTo(0, 0);
  }, [about]);
  useEffect(() => {
    if (
      !about &&
      (!draft.description.trim() ||
        draft.checkedContext !==
          JSON.stringify([
            draft.description.trim(),
            draft.language,
            draft.tags,
            draft.clarificationAnswer,
          ]))
    ) {
      navigate("/setup/about", { replace: true });
    }
  }, [
    about,
    draft.description,
    draft.checkedContext,
    draft.language,
    draft.tags,
    draft.clarificationAnswer,
    navigate,
  ]);
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
  const [checking, setChecking] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(false),
    [clarify, setClarify] = useState<Clarification | null>(null);
  const pending = useRef(false);
  const checkVersion = useRef(0);
  useEffect(
    () => () => {
      checkVersion.current += 1;
    },
    [location.pathname],
  );
  const recent = readLocal<string | null>("sp:recent", null);
  const focusTags = focusSuggestions[detectNiche(draft.description)];
  useEffect(() => {
    setStorageError(!writeLocal("sp:input", draft));
  }, [draft]);
  function contextKey(answer = draft.clarificationAnswer) {
    return JSON.stringify([
      draft.description.trim(),
      draft.language,
      draft.tags,
      answer,
    ]);
  }
  function showFeedback() {
    requestAnimationFrame(() => {
      feedback.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      feedback.current?.focus();
    });
  }
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
    setDraft((current) => ({
      ...current,
      ...value,
      ...(value.description !== undefined
        ? { clarificationAnswer: "", checkedContext: "" }
        : {}),
    }));
    setError("");
    setClarify(null);
  };
  function isTagSelected(tag: string) {
    return draft.tags.some(
      (current) => current.toLowerCase() === tag.toLowerCase(),
    );
  }
  function toggleTag(tag: string) {
    startSetup();
    const exists = draft.tags.some(
      (current) => current.toLowerCase() === tag.toLowerCase(),
    );
    setDraft((current) => ({
      ...current,
      tags: exists
        ? current.tags.filter(
            (item) => item.toLowerCase() !== tag.toLowerCase(),
          )
        : [...current.tags, tag].slice(-5),
    }));
    setError("");
  }
  function answerClarify(answer: string) {
    const value = answer.trim();
    if (!value || pending.current) return;
    void checkAbout(value);
  }
  async function checkAbout(answer = draft.clarificationAnswer) {
    if (pending.current) return;
    const gate = preflight(draft.description);
    if (gate && (!answer || gate.input_quality === "unusable")) {
      setError(
        gate.input_quality === "unusable" ? gate.clarifying_question : "",
      );
      setClarify(
        gate.input_quality === "too_vague"
          ? {
              question: gate.clarifying_question,
              options: gate.clarification_options,
              answer: "",
            }
          : null,
      );
      showFeedback();
      return;
    }
    if (draft.checkedContext === contextKey(answer)) {
      navigate("/setup/offers");
      return;
    }
    const version = ++checkVersion.current;
    pending.current = true;
    setChecking(true);
    setError("");
    try {
      const result = await api.assessInput({
        description: draft.description,
        language: draft.language,
        context_tags: draft.tags,
        ...(answer ? { clarification_answer: answer } : {}),
      });
      if (version !== checkVersion.current) return;
      if (result.input_quality === "ok") {
        setDraft((current) => ({
          ...current,
          clarificationAnswer: answer,
          checkedContext: contextKey(answer),
        }));
        setClarify(null);
        navigate("/setup/offers");
      } else {
        setDraft((current) => ({ ...current, checkedContext: "" }));
        setClarify(
          result.input_quality === "too_vague"
            ? {
                question: result.clarifying_question!,
                options: result.clarification_options,
                answer: "",
              }
            : null,
        );
        setError(
          result.input_quality === "unusable"
            ? result.clarifying_question!
            : "",
        );
        showFeedback();
      }
    } catch (error) {
      if (version !== checkVersion.current) return;
      setError(errorText(error));
      showFeedback();
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }
  async function generateWith(
    description: string,
    clarificationAnswer = draft.clarificationAnswer,
    tags = draft.tags,
  ) {
    const session = startSetup();
    const context = creatorContext({
      description,
      offer_status: draft.offerStatus,
      existing_offer: draft.existingOffer,
    });
    const gate = preflight(context);
    if (gate && !clarificationAnswer) {
      if (gate.input_quality === "unusable") {
        setClarify(null);
        setError(gate.clarifying_question);
      } else {
        setClarify({
          question: gate.clarifying_question,
          options: gate.clarification_options,
          answer: "",
        });
      }
      return;
    }
    const parsed = generateSchema.safeParse({
      ...setupProperties(session),
      offer_status: draft.offerStatus,
      ...(draft.offerStatus === "existing"
        ? { existing_offer: draft.existingOffer }
        : {}),
      description,
      context_tags: tags,
      ...(clarificationAnswer
        ? { clarification_answer: clarificationAnswer }
        : {}),
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
    setClarify(null);
    track("generate_requested", { language: draft.language });
    try {
      const result = await api.generate(parsed.data);
      if (result.input_quality !== "ok") {
        if (result.input_quality === "unusable") {
          setError(
            result.clarifying_question ||
              "Please add a little more about what you do.",
          );
        } else {
          setClarify({
            question: result.clarifying_question,
            options: result.clarification_options,
            answer: "",
          });
        }
        navigate("/setup/about");
        showFeedback();
        track("generate_failed", { language: draft.language });
        return;
      }
      writeLocal(tokenKey(result.slug), result.edit_token);
      writeLocal("sp:recent", result.slug);
      track("generate_succeeded", result.content);
      navigate(`/edit/${result.slug}#t=${result.edit_token}`, {
        state: { generated: true, assumptions: result.assumptions },
      });
    } catch (error) {
      setError(errorText(error));
      track("generate_failed", { language: draft.language });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
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
      if (clarify && !clarify.answer.trim()) {
        showFeedback();
        return;
      }
      await checkAbout(clarify?.answer.trim() || draft.clarificationAnswer);
      return;
    }
    if (draft.checkedContext !== contextKey()) {
      navigate("/setup/about");
      return;
    }
    await generateWith(draft.description);
  }
  const inputFeedback = (
    <div
      ref={feedback}
      tabIndex={-1}
      id="description-feedback"
      style={{ outline: "none" }}
    >
      {checking && <p role="status">Checking your description…</p>}
      {clarify && (
        <div className="clarify-card" aria-live="polite">
          <div className="clarify-head">
            <Sparkles size={16} />
            <p>{clarify.question}</p>
          </div>
          {clarify.options.length > 0 && (
            <div className="clarify-options">
              {clarify.options.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => answerClarify(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <div className="clarify-answer">
            <input
              aria-label="Your answer"
              value={clarify.answer}
              maxLength={120}
              placeholder="Or type a quick answer"
              onChange={(event) =>
                setClarify((current) =>
                  current
                    ? { ...current, answer: event.target.value }
                    : current,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  answerClarify(clarify.answer);
                }
              }}
            />
            <button
              type="button"
              className="button secondary"
              disabled={!clarify.answer.trim()}
              onClick={() => answerClarify(clarify.answer)}
            >
              Use this
            </button>
          </div>
          <button
            type="button"
            className="clarify-dismiss"
            onClick={() => {
              setClarify(null);
              if (!about) navigate("/setup/about");
            }}
          >
            {about ? "Edit my description instead" : "Change my description"}
          </button>
        </div>
      )}
      {error && <Notice>{error}</Notice>}
    </div>
  );
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
          <form onSubmit={submit} aria-busy={busy || checking}>
            <fieldset disabled={busy || checking} className="generation-fields">
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
                      aria-describedby="description-count description-feedback"
                      aria-invalid={Boolean(error)}
                      required
                    />
                    <span className="char-counter" id="description-count">
                      {draft.description.length}/1000
                    </span>
                  </div>
                  {inputFeedback}
                  <div className="examples">
                    <span>Need a little inspiration?</span>
                    <div>
                      {examples.map((example) => (
                        <button
                          type="button"
                          key={example.name}
                          onClick={() =>
                            update({ description: example.text, tags: [] })
                          }
                        >
                          <span>{example.icon}</span>
                          {example.name}
                          <Plus size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="quick-add">
                    <p className="quick-add-title">
                      Help AI get it right the first time <span>Optional</span>
                    </p>
                    <div className="quick-add-row">
                      <span>This is for</span>
                      <div>
                        {audienceTags.map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            aria-pressed={isTagSelected(tag)}
                            className={isTagSelected(tag) ? "selected" : ""}
                            onClick={() => toggleTag(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                    {focusTags.length > 0 && (
                      <div className="quick-add-row">
                        <span>You focus on</span>
                        <div>
                          {focusTags.map((tag) => (
                            <button
                              type="button"
                              key={tag}
                              aria-pressed={isTagSelected(tag)}
                              className={isTagSelected(tag) ? "selected" : ""}
                              onClick={() => toggleTag(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {draft.tags.length > 0 && (
                      <p className="quick-add-summary">
                        We’ll include: {draft.tags.join(" · ")}
                      </p>
                    )}
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
              {!about && error && <Notice>{error}</Notice>}
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
                  disabled={
                    !draft.description.trim() ||
                    (about && Boolean(clarify) && !clarify?.answer.trim())
                  }
                  type="submit"
                >
                  {!about && <Sparkles size={18} />}
                  {about
                    ? checking
                      ? "Checking…"
                      : "Continue"
                    : "Generate my storefront"}
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
