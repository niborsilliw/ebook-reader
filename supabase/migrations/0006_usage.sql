-- AI cost per answer, so we know what a reader costs (Phase 1, item 4).
alter table public.messages
  add column input_tokens integer,
  add column output_tokens integer,
  add column web_searches integer;
