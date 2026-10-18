-- Data del rilievo in cantiere (scelta all'apertura, modificabile). Null = rilievi precedenti: vale created_at.
alter table public.rilievi_veloci add column if not exists data_rilievo date;
