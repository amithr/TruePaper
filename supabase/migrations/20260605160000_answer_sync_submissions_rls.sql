-- Enable RLS on answer_sync_submissions (idempotent dedupe ledger).
-- Clients must use save_live_session_student_response RPC, not direct table access.

begin;

alter table public.answer_sync_submissions enable row level security;

commit;
