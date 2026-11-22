import type { Content, Audience, Language } from "../shared/domain";

export interface StoreRecord {
  slug: string;
  edit_token_hash: string;
  status: "draft" | "published";
  niche: Content["niche"];
  language: Language;
  input_text: string;
  audience_size: Audience;
  instagram_handle: string | null;
  offer_status: "existing" | "exploring" | null;
  existing_offer: string | null;
  content: Content;
  published_content: Content | null;
  views: number;
  updated_at: string;
  published_at: string | null;
  first_published_at: string | null;
  setup_session_id: string | null;
  setup_started_at: string | null;
  new_creator_session: boolean;
}
export type NewStore = Omit<
  StoreRecord,
  | "status"
  | "published_content"
  | "views"
  | "updated_at"
  | "published_at"
  | "first_published_at"
>;
export type StorePatch = Partial<
  Pick<
    StoreRecord,
    | "content"
    | "niche"
    | "language"
    | "status"
    | "published_at"
    | "first_published_at"
    | "published_content"
  >
>;
export interface StoreRepository {
  findOwner(slug: string): Promise<StoreRecord | null>;
  findPublic(slug: string): Promise<StoreRecord | null>;
  insert(store: NewStore): Promise<void>;
  update(
    slug: string,
    tokenHash: string,
    revision: string,
    patch: StorePatch,
  ): Promise<StoreRecord | null>;
  claimGeneration(
    key: string,
    ipLimit: number,
    dailyCap: number,
  ): Promise<{ allowed: boolean; model_allowed: boolean }>;
  claimTracking(key: string): Promise<boolean>;
  track(slug: string): Promise<void>;
}
export function ownerDTO(store: StoreRecord) {
  const {
    slug,
    status,
    niche,
    language,
    content,
    instagram_handle,
    views,
    updated_at,
    published_at,
    first_published_at,
  } = store;
  return {
    slug,
    status,
    niche,
    language,
    content,
    instagram_handle,
    views,
    updated_at,
    published_at,
    first_published_at,
  };
}
