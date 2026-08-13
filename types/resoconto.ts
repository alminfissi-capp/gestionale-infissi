import type { RigaPreventivo, RigaFattura } from '@/lib/resoconto'

export type ResocontoCommessa = {
  id: string
  organization_id: string
  commessa_id: string
  data_documento: string
  cliente_indirizzo: string | null
  cliente_piva: string | null
  cliente_cf: string | null
  cantiere_nome: string | null
  cantiere_indirizzo: string | null
  progetto_titolo: string | null
  progetto_sottotitolo: string | null
  progetto_cup: string | null
  righe_preventivi: RigaPreventivo[]
  righe_fatture: RigaFattura[]
  nota_fatture: string | null
  nota_titolo: string | null
  nota_testo: string | null
  nota_finale: string | null
  created_at: string
  updated_at: string
}

export type ResocontoCommessaInput = Omit<
  ResocontoCommessa,
  'id' | 'organization_id' | 'commessa_id' | 'created_at' | 'updated_at'
>

/** Dati con cui il form si precompila quando il resoconto non esiste ancora. */
export type DatiPrecompilazione = {
  preventivi: RigaPreventivo[]
  clienteIndirizzo: string | null
  clientePiva: string | null
  cantiere: string | null
}
