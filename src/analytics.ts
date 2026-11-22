import type { Content } from "../supabase/functions/_shared/domain";
import { activeSetupSession, setupProperties } from "./setup-session";
import { allowedContext, eventQueue } from "./analytics-events";
import type { Event, EventContext } from "./analytics-events";
const key = import.meta.env.VITE_POSTHOG_KEY;
const queue = eventQueue();
if (key)
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host:
          import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        person_profiles: "never",
        persistence: "localStorage",
        advanced_disable_feature_flags: true,
        sanitize_properties: (properties) => {
          for (const name of Object.keys(properties))
            if (/url|pathname|referrer|href|search|hash/i.test(name))
              delete properties[name];
          return properties;
        },
      });
      queue.connect((event, properties) => posthog.capture(event, properties));
    })
    .catch(() => undefined);
export function track(
  event: Event,
  content?: Partial<Pick<Content, "source" | "language" | "niche">>,
  extra?: EventContext,
) {
  const session = activeSetupSession(Date.now(), event !== "page_viewed");
  if (!key) return;
  queue.send(event, {
    source: content?.source ?? "ai",
    language: content?.language ?? "en",
    niche: content?.niche ?? "other",
    ...allowedContext(session ? setupProperties(session) : {}),
    ...allowedContext(extra),
  });
}
