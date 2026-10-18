-- Miniatura della sezione del profilo (path SVG ricavato dal DXF dal ponte): { viewBox, d }.
alter table public.fp_profili_sezioni add column if not exists anteprima jsonb;
