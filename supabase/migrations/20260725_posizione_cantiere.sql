-- Posizione GPS del cantiere (una per commessa)
alter table public.commesse
  add column if not exists cantiere_lat double precision,
  add column if not exists cantiere_lng double precision;
