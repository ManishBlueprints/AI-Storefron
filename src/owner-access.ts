import { tokenSchema } from "../supabase/functions/_shared/domain";
import { tokenKey, writeLocal } from "./storage";

export async function verifyOwnerAccess<T>(
  slug: string,
  token: string,
  load: (slug: string, token: string) => Promise<T>,
) {
  tokenSchema.parse(token);
  const store = await load(slug, token);
  // Never replace working access with an unverified fragment token.
  const persisted = writeLocal(tokenKey(slug), token);
  return { store, persisted };
}
