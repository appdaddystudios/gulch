-- Observation-ordered writes for events (docs/event-sync/DESIGN.md, "Ordering").
-- Every writer that mirrors Webflow state into events (webhook publish and
-- unpublish, the full reconcile) stamps the time it observed that state and
-- only lands when the row holds no newer observation. Nullable: rows written
-- before this column accept any observation.
alter table public.events add column observed_at timestamptz;

comment on column public.events.observed_at is
  'When the writer observed the Webflow state this row reflects. A write applies only if the row holds no newer observation.';
