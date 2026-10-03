create table if not exists public.shift_report_email_log (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  shift text not null default 'Daily',
  recipient text not null,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_date, shift, recipient)
);

alter table public.shift_report_email_log enable row level security;

create index if not exists shift_report_email_log_status_idx
on public.shift_report_email_log(status,report_date);
