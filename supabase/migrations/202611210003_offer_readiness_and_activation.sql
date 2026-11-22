alter table public.storefronts
  add column offer_status text check (offer_status in ('existing','exploring')),
  add column existing_offer text check (length(existing_offer) <= 500),
  add column published_content jsonb,
  add column published_contact_link text,
  add column first_published_at timestamptz,
  add column setup_session_id uuid,
  add column setup_started_at timestamptz,
  add column new_creator_session boolean not null default false;

-- Preserve already-published stores; new generated offers require explicit review.
update public.storefronts s set content = jsonb_set(s.content, '{products}', (
  select jsonb_agg(product || jsonb_build_object('ready_to_sell', coalesce((product->>'ready_to_sell')::boolean, s.status='published')) order by position)
  from jsonb_array_elements(s.content->'products') with ordinality p(product,position)
)) where jsonb_typeof(s.content->'products')='array';
update public.storefronts set published_content=content,
  published_contact_link=contact_link, first_published_at=published_at
where status='published';

-- Publishing snapshots and context changes participate in optimistic locking.
drop trigger storefront_updated on public.storefronts;
create trigger storefront_updated before update of content, contact_link,
  status, niche, language, input_text, audience_size, published_at,
  published_content, published_contact_link, offer_status, existing_offer
on public.storefronts for each row execute function public.touch_storefront();
