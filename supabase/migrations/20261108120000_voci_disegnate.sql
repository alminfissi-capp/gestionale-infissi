-- Rilievo unico: una voce del rilievo e' da struttura FP PRO (fp) oppure disegnata (grafico).
-- Le assegnazioni dell'ufficio (profili, riempimenti) stanno a parte, con il loro istante:
-- le scrive solo l'ufficio e non toccano updated_at (il telefono non deve venire scartato).
alter table rilievo_veloce_voci
  add column if not exists grafico jsonb,
  add column if not exists assegnazioni_grafico jsonb,
  add column if not exists assegnazioni_grafico_at timestamptz;

alter table rilievo_veloce_voci
  add constraint rilievo_veloce_voci_un_tipo check ((fp is null) <> (grafico is null));
