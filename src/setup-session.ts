import { readLocal, writeLocal } from "./storage";
const KEY = "sp:setup-session";
const IDLE_MS = 30 * 60 * 1000;
export interface SetupSession {
  id: string;
  startedAt: number;
  lastActiveAt: number;
  isNewCreator: boolean;
}
let memory: SetupSession | null = null;
function persist(value: SetupSession) {
  memory = value;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Same-page tracking still works without storage. */
  }
}
export function activeSetupSession(
  now = Date.now(),
  touch = false,
): SetupSession | null {
  let value = memory;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored) value = JSON.parse(stored);
  } catch {
    /* Use the memory fallback. */
  }
  if (
    !value ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value.id,
    ) ||
    typeof value.isNewCreator !== "boolean" ||
    !Number.isFinite(value.startedAt) ||
    !Number.isFinite(value.lastActiveAt) ||
    value.startedAt > now ||
    now - value.lastActiveAt >= IDLE_MS
  )
    return null;
  if (touch) {
    value = { ...value, lastActiveAt: now };
    persist(value);
  }
  return value;
}
export function beginSetupSession(now = Date.now()) {
  const active = activeSetupSession(now, true);
  if (active) return { session: active, started: false };
  const session: SetupSession = {
    id: crypto.randomUUID(),
    startedAt: now,
    lastActiveAt: now,
    isNewCreator: !readLocal<boolean>("sp:has-published", false),
  };
  persist(session);
  return { session, started: true };
}
export function markCreatorPublished() {
  writeLocal("sp:has-published", true);
}
export function setupProperties(session: SetupSession) {
  return {
    setup_session_id: session.id,
    setup_started_at: new Date(session.startedAt).toISOString(),
    new_creator_session: session.isNewCreator,
  };
}
