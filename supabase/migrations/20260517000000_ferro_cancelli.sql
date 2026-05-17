-- Sezioni barre (quadro, piatta, tondo, scatolato)
create table ferro_sezioni_piene (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  categoria text not null,
  prezzo numeric(10,2) not null default 0,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Sezioni colonne (tubi quadri, ecc.)
create table ferro_sezioni_colonna (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  categoria text not null,
  prezzo numeric(10,2) not null default 0,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Binari per scorrevoli
create table ferro_binari (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  categoria text not null,
  prezzo numeric(10,2) not null default 0,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Accessori e kit
create table ferro_accessori (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  categoria text not null,
  prezzo numeric(10,2) not null default 0,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Preventivi salvati
create table ferro_preventivi (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  cliente text,
  tipo text not null,
  config jsonb not null,
  totale_costo numeric(10,2),
  totale_vendita numeric(10,2),
  margine numeric(5,2),
  note text,
  created_at timestamptz default now()
);

-- Seed sezioni piene
insert into ferro_sezioni_piene (label, categoria, prezzo) values
  ('Quadro 10×10',        'quadro',    3.50),
  ('Quadro 12×12',        'quadro',    4.20),
  ('Quadro 14×14',        'quadro',    5.00),
  ('Quadro 20×20',        'quadro',    8.50),
  ('Piatta 20×3',         'piatta',    2.80),
  ('Piatta 20×4',         'piatta',    3.20),
  ('Piatta 30×4',         'piatta',    4.50),
  ('Piatta 40×4',         'piatta',    6.00),
  ('Piatta 40×5',         'piatta',    7.50),
  ('Piatta 50×5',         'piatta',    9.20),
  ('Tondo ø12',           'tondo',     3.80),
  ('Tondo ø16',           'tondo',     6.50),
  ('Scatolato 20×20×1.5', 'scatolato', 5.50),
  ('Scatolato 25×25×2',   'scatolato', 7.20),
  ('Scatolato 30×30×2',   'scatolato', 9.00),
  ('Scatolato 40×20×2',   'scatolato', 8.50),
  ('Scatolato 40×40×2',   'scatolato', 11.50),
  ('Scatolato 50×30×2',   'scatolato', 12.00);

-- Seed sezioni colonna
insert into ferro_sezioni_colonna (label, categoria, prezzo) values
  ('Tubo Q 40×40×2',   'tubo_quadro', 12.00),
  ('Tubo Q 60×60×3',   'tubo_quadro', 22.00),
  ('Tubo Q 80×80×3',   'tubo_quadro', 32.00),
  ('Tubo Q 100×100×4', 'tubo_quadro', 48.00);

-- Seed binari
insert into ferro_binari (label, categoria, prezzo) values
  ('Binario 40×40×3',               'binario',             18.00),
  ('Binario 50×50×3',               'binario',             24.00),
  ('Binario 60×60×4',               'binario',             32.00),
  ('Binario con cremagliera 40×40', 'binario_motorizzato', 38.00);

-- Seed accessori
insert into ferro_accessori (label, categoria, prezzo) values
  ('Coppia cardini standard',        'cardini',     18.00),
  ('Coppia cardini rinforzati',      'cardini',     28.00),
  ('Serratura a cilindro',           'serrature',   35.00),
  ('Maniglia esterna',               'maniglie',    22.00),
  ('Chiavistello verticale',         'chiusure',    12.00),
  ('Fermaporta a pavimento',         'chiusure',    15.00),
  ('Molla di chiusura',              'chiusure',    20.00),
  ('Coppia ruote scorrimento',       'scorrevole',  35.00),
  ('Guida superiore antisfilamento', 'scorrevole',  18.00),
  ('Fermacorsa fine corsa',          'scorrevole',   8.00),
  ('Kit automatismo CAME BX-78',     'automatismi', 380.00),
  ('Kit automatismo FAAC 740',       'automatismi', 420.00),
  ('Coppia fotocellule',             'automatismi',  65.00),
  ('Lampeggiante 230V',              'automatismi',  45.00);
