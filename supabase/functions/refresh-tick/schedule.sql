-- Rollout note:
-- Run this manually later, after refresh-tick is deployed and GULCH_REFRESH_SECRET
-- is set. It enables the database-side scheduler that posts to the Edge Function
-- every 6 hours (webhooks carry the real-time path; this is the safety net).
-- Replace the project URL and secret reference placeholders during rollout.
--
-- To change only the cadence of an existing job without re-entering the secret:
--   select cron.alter_job(jobid, schedule := '0 */6 * * *')
--   from cron.job where jobname = 'gulch-refresh-tick-daily';
--
-- pg_net gives up waiting after 5 s but the function keeps running; the
-- sync_runs table, not cron.job_run_details, is the record of success.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'gulch-refresh-tick-daily') then
    perform cron.unschedule('gulch-refresh-tick-daily');
  end if;
end;
$$;

select cron.schedule(
  'gulch-refresh-tick-daily',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := '<PROJECT_FUNCTION_URL>/functions/v1/refresh-tick',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      'Bearer ' || '<GULCH_REFRESH_SECRET_FROM_VAULT_OR_ROLLOUT_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

