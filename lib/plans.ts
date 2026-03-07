import type { Plan } from '@/types/subscription'

export type PlanLimits = {
  maxCategorie: number | null          // null = illimitato
  maxListiniPerCategoria: number | null
  maxClienti: number | null
  maxPreventiviMese: number | null
  maxUtenti: number | null
  importMultiplo: boolean
  cataloghiBrochure: boolean
  exportCsv: boolean
  exportZip: boolean
}

export type PlanInfo = {
  nome: string
  prezzoMese: number   // EUR
  prezzoAnno: number   // EUR (sconto ~20%)
  limits: PlanLimits
}

export const PIANI: Record<Plan, PlanInfo> = {
  trial: {
    nome: 'Trial',
    prezzoMese: 0,
    prezzoAnno: 0,
    limits: {
      maxCategorie: 2,
      maxListiniPerCategoria: 3,
      maxClienti: 10,
      maxPreventiviMese: 5,
      maxUtenti: 1,
      importMultiplo: false,
      cataloghiBrochure: false,
      exportCsv: false,
      exportZip: false,
    },
  },
  base: {
    nome: 'Base',
    prezzoMese: 49,
    prezzoAnno: 470,
    limits: {
      maxCategorie: 5,
      maxListiniPerCategoria: 15,
      maxClienti: 100,
      maxPreventiviMese: 50,
      maxUtenti: 2,
      importMultiplo: true,
      cataloghiBrochure: false,
      exportCsv: true,
      exportZip: false,
    },
  },
  pro: {
    nome: 'Pro',
    prezzoMese: 89,
    prezzoAnno: 850,
    limits: {
      maxCategorie: null,
      maxListiniPerCategoria: null,
      maxClienti: null,
      maxPreventiviMese: null,
      maxUtenti: 5,
      importMultiplo: true,
      cataloghiBrochure: true,
      exportCsv: true,
      exportZip: true,
    },
  },
  business: {
    nome: 'Business',
    prezzoMese: 149,
    prezzoAnno: 1430,
    limits: {
      maxCategorie: null,
      maxListiniPerCategoria: null,
      maxClienti: null,
      maxPreventiviMese: null,
      maxUtenti: null,
      importMultiplo: true,
      cataloghiBrochure: true,
      exportCsv: true,
      exportZip: true,
    },
  },
}

/** Restituisce i limiti del piano corrente */
export function getLimits(plan: Plan): PlanLimits {
  return PIANI[plan].limits
}

/** Controlla se una feature è disponibile per il piano */
export function hasFeature(plan: Plan, feature: keyof PlanLimits): boolean {
  const val = PIANI[plan].limits[feature]
  return typeof val === 'boolean' ? val : val !== 0
}

/** Controlla se un valore è entro il limite (null = illimitato) */
export function withinLimit(plan: Plan, key: keyof PlanLimits, current: number): boolean {
  const limit = PIANI[plan].limits[key]
  if (limit === null || typeof limit === 'boolean') return true
  return current < limit
}

/** True se il piano è attivo (trial non scaduto oppure abbonamento attivo) */
export function isPlanActive(status: string, trialEndsAt: string | null): boolean {
  if (status === 'active') return true
  if (status === 'trialing' && trialEndsAt) {
    return new Date(trialEndsAt) > new Date()
  }
  return false
}

/** Giorni rimanenti al trial (0 se scaduto o non in trial) */
export function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0
  const diff = new Date(trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
