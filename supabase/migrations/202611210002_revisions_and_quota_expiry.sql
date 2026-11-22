-- Counters are independent of content revisions used for optimistic locking.
drop trigger storefront_updated on public.storefronts;
create trigger storefront_updated
before update of content, contact_link, status, niche, language, input_text,
  audience_size, published_at on public.storefronts
for each row execute function public.touch_storefront();

-- Both quota entry points maintain expiry, even when model budget is exhausted.
-- Bound work per request and skip rows another request is already cleaning.
create function public.cleanup_rate_limits() returns void
language sql security definer set search_path = '' as $$
  delete from public.rate_limits where ctid in (
    select ctid from public.rate_limits
    where window_start < now() - interval '2 days'
    order by window_start limit 500 for update skip locked
  );
$$;
revoke execute on function public.cleanup_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_rate_limits() to service_role;

create or replace function public.claim_generation(p_key text, p_ip_limit integer, p_daily_cap integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  hourly timestamptz := date_trunc('hour', now());
  daily timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  ip_count integer;
  daily_count integer;
begin
  perform public.cleanup_rate_limits();
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
  return jsonb_build_object('allowed', true, 'model_allowed', true);
end;
$$;
-- Rate-limit inexpensive public tracking independently from generation.
create or replace function public.claim_tracking(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.cleanup_rate_limits();
  insert into public.rate_limits(key, window_start, count)
    values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, window_start) do update set count = public.rate_limits.count + 1
    returning count into n;
  return n <= 60;
end;
$$;
