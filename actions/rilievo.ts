'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  FormaSerramentoCompleta,
  FormaSerramentoInput,
  MisuraInput,
  AngoloInput,
} from '@/types/rilievo'

async function getOrgId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non autenticato')
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (error || !profile) throw new Error('Profilo non trovato')
  return profile.organization_id
}

// Forme di default da creare se l'org non ne ha ancora
const FORME_DEFAULT: FormaSerramentoInput[] = [
  {
    nome: 'Rettangolo',
    svg_template: 'rettangolo',
    attiva: true,
    ordine: 0,
    misure: [
      { codice: 'L', nome: 'Larghezza', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
    ],
    angoli: [
      { nome: 'Angolo', tipo: 'fisso', gradi: 90, ordine: 0 },
    ],
  },
  {
    nome: 'Arco a tutto sesto',
    svg_template: 'arco_pieno',
    attiva: true,
    ordine: 1,
    misure: [
      { codice: 'L', nome: 'Larghezza', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza totale', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
      { codice: 'R', nome: 'Raggio', tipo: 'calcolato', formula: 'L / 2', unita: 'mm', ordine: 2 },
    ],
    angoli: [],
  },
  {
    nome: 'Arco ribassato',
    svg_template: 'arco_ribassato',
    attiva: true,
    ordine: 2,
    misure: [
      { codice: 'L', nome: 'Larghezza', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza totale', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
      { codice: 'F', nome: 'Freccia', tipo: 'input', formula: null, unita: 'mm', ordine: 2 },
    ],
    angoli: [],
  },
  {
    nome: 'Arco acuto',
    svg_template: 'arco_acuto',
    attiva: true,
    ordine: 3,
    misure: [
      { codice: 'L', nome: 'Larghezza', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza totale', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
    ],
    angoli: [],
  },
  {
    nome: 'Trapezio',
    svg_template: 'trapezio',
    attiva: true,
    ordine: 4,
    misure: [
      { codice: 'B', nome: 'Base', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'b', nome: 'Base minore', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
      { codice: 'H', nome: 'Altezza', tipo: 'input', formula: null, unita: 'mm', ordine: 2 },
    ],
    angoli: [
      { nome: 'Angolo base sinistra', tipo: 'libero', gradi: null, ordine: 0 },
      { nome: 'Angolo base destra', tipo: 'libero', gradi: null, ordine: 1 },
    ],
  },
  {
    nome: 'Parallelogramma',
    svg_template: 'parallelogramma',
    attiva: true,
    ordine: 5,
    misure: [
      { codice: 'L', nome: 'Larghezza', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
    ],
    angoli: [
      { nome: 'Angolo acuto', tipo: 'libero', gradi: null, ordine: 0 },
    ],
  },
  {
    nome: 'Triangolo',
    svg_template: 'triangolo',
    attiva: true,
    ordine: 6,
    misure: [
      { codice: 'B', nome: 'Base', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
    ],
    angoli: [
      { nome: 'Angolo base sinistra', tipo: 'libero', gradi: null, ordine: 0 },
      { nome: 'Angolo base destra', tipo: 'libero', gradi: null, ordine: 1 },
      { nome: 'Angolo apice', tipo: 'libero', gradi: null, ordine: 2 },
    ],
  },
  {
    nome: 'Semicerchio',
    svg_template: 'semicerchio',
    attiva: true,
    ordine: 7,
    misure: [
      { codice: 'D', nome: 'Diametro', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'R', nome: 'Raggio', tipo: 'calcolato', formula: 'D / 2', unita: 'mm', ordine: 1 },
    ],
    angoli: [],
  },
  {
    nome: 'Cerchio',
    svg_template: 'cerchio',
    attiva: true,
    ordine: 8,
    misure: [
      { codice: 'D', nome: 'Diametro', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'R', nome: 'Raggio', tipo: 'calcolato', formula: 'D / 2', unita: 'mm', ordine: 1 },
    ],
    angoli: [],
  },
  {
    nome: 'Ovale',
    svg_template: 'ovale',
    attiva: true,
    ordine: 9,
    misure: [
      { codice: 'L', nome: 'Larghezza', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
    ],
    angoli: [],
  },
  {
    nome: 'Forma a L',
    svg_template: 'forma_l',
    attiva: true,
    ordine: 10,
    misure: [
      { codice: 'L', nome: 'Larghezza totale', tipo: 'input', formula: null, unita: 'mm', ordine: 0 },
      { codice: 'H', nome: 'Altezza totale', tipo: 'input', formula: null, unita: 'mm', ordine: 1 },
      { codice: 'l', nome: 'Larghezza rientranza', tipo: 'input', formula: null, unita: 'mm', ordine: 2 },
      { codice: 'h', nome: 'Altezza rientranza', tipo: 'input', formula: null, unita: 'mm', ordine: 3 },
    ],
    angoli: [
      { nome: 'Angoli', tipo: 'fisso', gradi: 90, ordine: 0 },
    ],
  },
]

export async function getForme(): Promise<FormaSerramentoCompleta[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: forme, error } = await supabase
    .from('forme_serramento')
    .select('*, misure_forma(*), angoli_forma(*)')
    .eq('organization_id', orgId)
    .order('ordine')

  if (error) throw new Error(error.message)

  // Se non ci sono forme, crea i default
  if (!forme || forme.length === 0) {
    await seedFormeDefault(orgId)
    return getForme()
  }

  return (forme ?? []).map((f) => ({
    ...f,
    misure: (f.misure_forma ?? []).sort((a: MisuraInput & { id: string; forma_id: string }, b: MisuraInput & { id: string; forma_id: string }) => a.ordine - b.ordine),
    angoli: (f.angoli_forma ?? []).sort((a: AngoloInput & { id: string; forma_id: string }, b: AngoloInput & { id: string; forma_id: string }) => a.ordine - b.ordine),
  }))
}

export async function getFormeAttive(): Promise<FormaSerramentoCompleta[]> {
  const forme = await getForme()
  return forme.filter((f) => f.attiva)
}

async function seedFormeDefault(orgId: string): Promise<void> {
  const supabase = await createClient()

  for (const f of FORME_DEFAULT) {
    const { data: forma, error } = await supabase
      .from('forme_serramento')
      .insert({
        organization_id: orgId,
        nome: f.nome,
        svg_template: f.svg_template,
        attiva: f.attiva,
        ordine: f.ordine,
      })
      .select('id')
      .single()

    if (error || !forma) continue

    if (f.misure.length > 0) {
      await supabase.from('misure_forma').insert(
        f.misure.map((m) => ({ ...m, forma_id: forma.id }))
      )
    }
    if (f.angoli.length > 0) {
      await supabase.from('angoli_forma').insert(
        f.angoli.map((a) => ({ ...a, forma_id: forma.id }))
      )
    }
  }
}

export async function createForma(input: FormaSerramentoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { data: forma, error } = await supabase
    .from('forme_serramento')
    .insert({
      organization_id: orgId,
      nome: input.nome,
      svg_template: input.svg_template,
      attiva: input.attiva,
      ordine: input.ordine,
    })
    .select('id')
    .single()

  if (error || !forma) throw new Error(error?.message ?? 'Errore creazione forma')

  if (input.misure.length > 0) {
    const { error: em } = await supabase.from('misure_forma').insert(
      input.misure.map((m) => ({ ...m, id: undefined, forma_id: forma.id }))
    )
    if (em) throw new Error(em.message)
  }
  if (input.angoli.length > 0) {
    const { error: ea } = await supabase.from('angoli_forma').insert(
      input.angoli.map((a) => ({ ...a, id: undefined, forma_id: forma.id }))
    )
    if (ea) throw new Error(ea.message)
  }

  revalidatePath('/rilievo/impostazioni')
}

export async function updateForma(id: string, input: FormaSerramentoInput): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('forme_serramento')
    .update({
      nome: input.nome,
      svg_template: input.svg_template,
      attiva: input.attiva,
      ordine: input.ordine,
    })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) throw new Error(error.message)

  // Rimpiazza misure e angoli
  await supabase.from('misure_forma').delete().eq('forma_id', id)
  await supabase.from('angoli_forma').delete().eq('forma_id', id)

  if (input.misure.length > 0) {
    const { error: em } = await supabase.from('misure_forma').insert(
      input.misure.map((m) => ({ ...m, id: undefined, forma_id: id }))
    )
    if (em) throw new Error(em.message)
  }
  if (input.angoli.length > 0) {
    const { error: ea } = await supabase.from('angoli_forma').insert(
      input.angoli.map((a) => ({ ...a, id: undefined, forma_id: id }))
    )
    if (ea) throw new Error(ea.message)
  }

  revalidatePath('/rilievo/impostazioni')
}

export async function deleteForma(id: string): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('forme_serramento')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}

export async function toggleFormaAttiva(id: string, attiva: boolean): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()

  const { error } = await supabase
    .from('forme_serramento')
    .update({ attiva })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (error) throw new Error(error.message)
  revalidatePath('/rilievo/impostazioni')
}
