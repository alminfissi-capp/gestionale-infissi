-- Anno di riferimento dei crediti fiscali (es. la quota 2028 di un bonus in 10 anni).
alter table public.crediti_fiscali add column if not exists anno integer check (anno between 1990 and 2100);

-- Prima compilazione dai nomi che finivano con "anno 2027": i nomi restano com'erano.
update public.crediti_fiscali
  set anno = substring(nome from '(?i)anno\s+(\d{4})\s*$')::int
  where anno is null and nome ~* 'anno\s+\d{4}\s*$';
