import { z } from "zod";
export const setupContextSchema = z.object({
  setup_session_id: z.string().uuid().optional(),
  setup_started_at: z.string().datetime({ offset: true }).optional(),
  new_creator_session: z.boolean().optional(),
});
export const publicationSchema = z.object({
  first_publish: z.boolean(),
  setup_session_id: z.string().uuid().nullable(),
  setup_started_at: z.string().nullable(),
  new_creator_session: z.boolean(),
  same_setup_session: z.boolean(),
  time_to_first_publish_ms: z.number().nonnegative().nullable(),
});
export type Publication = z.infer<typeof publicationSchema>;
export function publicationMetrics(
  record: {
    first_published_at?: string | null;
    setup_session_id?: string | null;
    setup_started_at?: string | null;
    new_creator_session?: boolean;
  },
  now: string,
  currentSessionId?: string,
): Publication {
  const first = !record.first_published_at;
  const elapsed = record.setup_started_at
    ? Date.parse(record.first_published_at || now) -
      Date.parse(record.setup_started_at)
    : NaN;
  return {
    first_publish: first,
    setup_session_id: record.setup_session_id ?? null,
    setup_started_at: record.setup_started_at ?? null,
    new_creator_session: record.new_creator_session === true,
    same_setup_session: Boolean(
      record.setup_session_id && record.setup_session_id === currentSessionId,
    ),
    time_to_first_publish_ms:
      Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null,
  };
}
