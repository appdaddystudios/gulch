-- events: editor's pick flag (additive, non-destructive)
-- Mirrors the Webflow `is-editor-s-pick` Switch. NOT NULL with a default so
-- existing rows and any upsert that omits the column stay valid.
alter table public.events
  add column editors_pick boolean not null default false;

create index events_editors_pick_idx on public.events(editors_pick)
  where editors_pick = true;
