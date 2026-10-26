-- The free-form notebook (0003_notebooks.sql) was removed from the app before
-- v1.0. Drop its table, and with it its policies and trigger.
drop table if exists public.notebooks cascade;
