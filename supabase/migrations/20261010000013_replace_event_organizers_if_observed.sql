-- Per-event organizer replacement ordered with the event row's observation
-- (docs/event-sync/DESIGN.md, "Ordering"). The webhook writes the events row
-- under observation-ordered rules, then calls this to replace the junction
-- rows. The events row is locked so a concurrent handler's row write waits;
-- the replacement happens only if the row still carries this handler's
-- observation. Returns false when a newer observation landed first.
create or replace function public.replace_event_organizers_if_observed(
  p_event_id text,
  p_organizer_ids text[],
  p_observed_at timestamptz
) returns boolean
language plpgsql
as $$
declare
  v_observed_at timestamptz;
begin
  select observed_at into v_observed_at
    from public.events
    where webflow_item_id = p_event_id
    for update;

  if not found or v_observed_at is distinct from p_observed_at then
    return false;
  end if;

  delete from public.event_organizers where event_id = p_event_id;

  insert into public.event_organizers (event_id, organizer_id)
    select p_event_id, organizer_id
    from unnest(coalesce(p_organizer_ids, '{}'::text[])) as organizer_id
    on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.replace_event_organizers_if_observed(text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.replace_event_organizers_if_observed(text, text[], timestamptz) to service_role;
