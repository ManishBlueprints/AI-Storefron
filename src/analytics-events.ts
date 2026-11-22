export type Event =
  | "setup_started"
  | "input_started"
  | "generate_requested"
  | "generate_succeeded"
  | "generate_failed"
  | "field_edited"
  | "section_regenerated"
  | "store_published"
  | "store_first_published"
  | "link_shared"
  | "page_viewed";
export interface EventContext {
  field?: string;
  scope?: string;
  method?: string;
  setup_session_id?: string | null;
  setup_started_at?: string | null;
  new_creator_session?: boolean;
  first_publish?: boolean;
  same_setup_session?: boolean;
  time_to_first_publish_ms?: number | null;
}
const fields = [
  "field",
  "scope",
  "method",
  "setup_session_id",
  "setup_started_at",
  "new_creator_session",
  "first_publish",
  "same_setup_session",
  "time_to_first_publish_ms",
] as const;
export function allowedContext(
  context: EventContext = {},
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    const value = context[field];
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "string"
    )
      safe[field] = value;
  }
  return safe;
}
// A bounded queue preserves fast interactions while the optional SDK loads.
export function eventQueue(limit = 100) {
  let sink:
    ((event: Event, properties: Record<string, unknown>) => void) | null = null;
  const pending: [Event, Record<string, unknown>][] = [];
  return {
    send(event: Event, properties: Record<string, unknown>) {
      if (sink) {
        try {
          sink(event, properties);
        } catch {
          /* Analytics must never block the creator flow. */
        }
      } else {
        if (pending.length === limit) pending.shift();
        pending.push([event, properties]);
      }
    },
    connect(
      capture: (event: Event, properties: Record<string, unknown>) => void,
    ) {
      sink = capture;
      for (const [event, properties] of pending.splice(0)) {
        try {
          capture(event, properties);
        } catch {
          /* Analytics remains optional. */
        }
      }
    },
  };
}
