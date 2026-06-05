-- Drop the legacy 4-arg save_live_session_student_response wrapper.
--
-- The app always calls the 5-arg overload (uuid, text, jsonb, text, uuid) with
-- a client- or server-generated submission id. Keeping the 4-arg wrapper around
-- only created PostgREST overload ambiguity ("missing 4-arg" errors) when the
-- gateway could not disambiguate between the two signatures. Removing it makes
-- the 5-arg signature the single, unambiguous entry point.

begin;

drop function if exists public.save_live_session_student_response(uuid, text, jsonb, text);

commit;
