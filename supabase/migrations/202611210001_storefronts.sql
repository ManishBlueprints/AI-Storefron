create table public.storefronts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  edit_token_hash text not null check (length(edit_token_hash) = 64),
  status text not null default 'draft' check (status in ('draft', 'published')),
  niche text not null check (niche in ('fitness','finance','cooking','exam_prep','astrology','other')),
  language text not null check (language in ('en','hinglish')),
  audience_size text check (audience_size in ('under_5k','5k_25k','25k_plus')),
  input_text text not null check (length(input_text) between 1 and 1000),
  contact_link text,
  content jsonb not null,
  views integer not null default 0,
  buy_clicks integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_expiry on public.rate_limits (window_start);
alter table public.storefronts enable row level security;
alter table public.rate_limits enable row level security;
revoke all on public.storefronts, public.rate_limits from anon, authenticated;
grant all on public.storefronts, public.rate_limits to service_role;

create function public.touch_storefront() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
create trigger storefront_updated before update on public.storefronts for each row execute function public.touch_storefront();

-- Every generation/regeneration shares an hourly IP quota. The global daily
-- quota counts model-eligible requests; after it fills, templates remain usable.
create function public.claim_generation(p_key text, p_ip_limit integer, p_daily_cap integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  hourly timestamptz := date_trunc('hour', now());
  daily timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  ip_count integer;
  daily_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  select count into ip_count from public.rate_limits where key = p_key and window_start = hourly;
  if coalesce(ip_count, 0) >= p_ip_limit then
    return jsonb_build_object('allowed', false, 'model_allowed', false);
  end if;
  insert into public.rate_limits(key, window_start, count) values (p_key, hourly, 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1;
  perform pg_advisory_xact_lock(hashtextextended('global:daily', 0));
  select count into daily_count from public.rate_limits where key = 'global:daily' and window_start = daily;
  if coalesce(daily_count, 0) >= p_daily_cap then
    return jsonb_build_object('allowed', true, 'model_allowed', false);
  end if;
  insert into public.rate_limits(key, window_start, count) values ('global:daily', daily, 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return jsonb_build_object('allowed', true, 'model_allowed', true);
end;
$$;
-- Rate-limit inexpensive public tracking independently from generation.
create function public.claim_tracking(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.rate_limits(key, window_start, count)
    values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    returning count into n;
  return n <= 60;
end;
$$;
create function public.track_storefront(p_slug text, p_event text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_event not in ('view', 'buy_click') then return; end if;
  update public.storefronts set
    views = views + case when p_event = 'view' then 1 else 0 end,
    buy_clicks = buy_clicks + case when p_event = 'buy_click' then 1 else 0 end
  where slug = p_slug and status = 'published';
end;
$$;
revoke execute on function public.claim_generation(text, integer, integer), public.claim_tracking(text), public.track_storefront(text, text) from public, anon, authenticated;
grant execute on function public.claim_generation(text, integer, integer), public.claim_tracking(text), public.track_storefront(text, text) to service_role;
