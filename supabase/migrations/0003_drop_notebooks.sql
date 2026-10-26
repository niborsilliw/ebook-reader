-- A free-form notebooks table was briefly added to the live database before
-- v1.0 and then removed from the app. Drop it (with its policies and trigger)
-- wherever it still exists; on a fresh database this does nothing.
drop table if exists public.notebooks cascade;
