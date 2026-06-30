-- events: image columns (additive, nullable, non-destructive)
alter table public.events
  add column image_url text,
  add column image_status text not null default 'pending'
    check (image_status in ('pending', 'ok', 'failed', 'unavailable')),
  add column image_checksum text,
  add column image_fetched_at timestamptz;

create index events_image_status_idx on public.events(image_status)
  where image_status in ('pending', 'failed');

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name='storage') then
    insert into storage.buckets (id, name, public) values ('event-images','event-images', true) on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='event_images_public_read') then
      execute 'create policy event_images_public_read on storage.objects for select to anon, authenticated using (bucket_id = ''event-images'')';
    end if;
  end if;
end $$;
