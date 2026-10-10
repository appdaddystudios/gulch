-- Atomic debounce claim for reconciles started by site_publish webhooks
-- (docs/event-sync/DESIGN.md, "Ordering"). The window check and the
-- sync_runs insert happen under one advisory lock, so concurrent deliveries
-- cannot all pass a read-then-schedule. Returns the new run id, or null when
-- a run for this source started inside the window.
create or replace function public.claim_sync_run(p_source text, p_debounce_ms integer)
returns bigint
language plpgsql
as $$
declare
  v_last timestamptz;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('sync_runs:' || p_source));

  select max(started_at) into v_last from public.sync_runs where source = p_source;
  if v_last is not null and v_last > now() - make_interval(secs => p_debounce_ms / 1000.0) then
    return null;
  end if;

  insert into public.sync_runs (source) values (p_source) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.claim_sync_run(text, integer) from public, anon, authenticated;
grant execute on function public.claim_sync_run(text, integer) to service_role;
