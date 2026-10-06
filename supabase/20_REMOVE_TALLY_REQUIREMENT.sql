-- Tally is no longer used for breakfast menu submissions.
-- Keep the legacy column for historical rows, but do not require it for native submissions.
alter table public.breakfast_submissions
  alter column tally_submission_id drop not null;
