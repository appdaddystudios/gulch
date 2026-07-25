-- events: Instagram video flag (additive, non-destructive)
-- True when the linked Instagram post is a video (reel/tv) — detected by the
-- image pipeline from the post's canonical og:url. The app uses it to offer
-- in-place playback via Instagram's public /embed/ player.
alter table public.events
  add column is_video boolean not null default false;
