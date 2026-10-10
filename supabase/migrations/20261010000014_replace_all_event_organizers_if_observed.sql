-- Full organizer replacement for the reconcile, ordered with event
-- observations (docs/event-sync/DESIGN.md, "Ordering"). Events a webhook
-- observed after the run started hold newer relationships than the run's
-- snapshot; they are left out of both the clear and the insert, inside the
-- same transaction, so no per-event write can slip between a check and the
-- replacement. Returns the number of junction rows inserted.
create or replace function public.replace_all_event_organizers_if_observed(
  p_event_ids text[],
  p_organizer_ids text[],
  p_observed_at timestamptz
) returns integer
language plpgsql
as $$
declare
  v_inserted integer;
begin
  delete from public.event_organizers eo
    using public.events e
    where e.webflow_item_id = eo.event_id
      and (e.observed_at is null or e.observed_at <= p_observed_at);

  insert into public.event_organizers (event_id, organizer_id)
    select r.event_id, r.organizer_id
    from unnest(coalesce(p_event_ids, '{}'::text[]), coalesce(p_organizer_ids, '{}'::text[])) as r(event_id, organizer_id)
    join public.events e on e.webflow_item_id = r.event_id
    where e.observed_at is null or e.observed_at <= p_observed_at
    on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.replace_all_event_organizers_if_observed(text[], text[], timestamptz) from public, anon, authenticated;
grant execute on function public.replace_all_event_organizers_if_observed(text[], text[], timestamptz) to service_role;
