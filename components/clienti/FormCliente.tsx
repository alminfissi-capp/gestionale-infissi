'use client'

import { useRef, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Building2, User } from 'lucide-react'
import { clienteSchema, type ClienteInput } from '@/lib/validations/clienteSchema'
import { createCliente, updateCliente } from '@/actions/clienti'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Cliente } from '@/types/cliente'

interface Props {
  cliente?: Cliente
  onSuccess: () => void
}

export default function FormCliente({ cliente, onSuccess }: Props) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      tipo: cliente?.tipo ?? 'privato',
      ragione_sociale: cliente?.ragione_sociale ?? '',
      nome: cliente?.nome ?? '',
      cognome: cliente?.cognome ?? '',
      telefono: cliente?.telefono ?? '',
      email: cliente?.email ?? '',
      via: cliente?.via ?? '',
      civico: cliente?.civico ?? '',
      cap: cliente?.cap ?? '',
      citta: cliente?.citta ?? '',
      provincia: cliente?.provincia ?? '',
      nazione: cliente?.nazione ?? '',
      codice_sdi: cliente?.codice_sdi ?? '',
      cantiere: cliente?.cantiere ?? '',
      cf_piva: cliente?.cf_piva ?? '',
      note: cliente?.note ?? '',
    },
  })

  const tipo = useWatch({ control, name: 'tipo' })
  const prevTipo = useRef(tipo)

  // Quando si cambia tipo, azzera i campi dell'altro tipo per evitare contaminazione
  useEffect(() => {
    if (prevTipo.current !== tipo) {
      if (tipo === 'privato') {
        setValue('ragione_sociale', '')
      } else {
        setValue('nome', '')
        setValue('cognome', '')
      }
      prevTipo.current = tipo
    }
  }, [tipo, setValue])

  const onSubmit = async (data: ClienteInput) => {
    try {
      if (cliente) {
        await updateCliente(cliente.id, data)
        toast.success('Cliente aggiornato')
      } else {
        await createCliente(data)
        toast.success('Cliente creato')
      }
      onSuccess()
    } catch {
      toast.error('Errore nel salvataggio del cliente')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* ── Scelta tipo — obbligatoria come primo passo ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Tipo cliente
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border-2 cursor-pointer transition-colors ${tipo === 'privato' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            <input type="radio" value="privato" {...register('tipo')} className="sr-only" />
            <User className="h-5 w-5" />
            <span className="text-sm font-semibold">Privato</span>
          </label>
          <label className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border-2 cursor-pointer transition-colors ${tipo === 'azienda' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            <input type="radio" value="azienda" {...register('tipo')} className="sr-only" />
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Azienda</span>
          </label>
        </div>
      </div>

      {/* ── Dati anagrafici (specifici per tipo) ── */}
      <div className="rounded-lg border p-4 space-y-3 bg-gray-50">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {tipo === 'azienda' ? 'Dati azienda' : 'Dati persona'}
        </p>

        {tipo === 'azienda' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ragione_sociale">Ragione sociale *</Label>
              <Input id="ragione_sociale" {...register('ragione_sociale')} autoFocus />
              {errors.ragione_sociale && (
                <p className="text-sm text-red-600">{errors.ragione_sociale.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf_piva">Partita IVA</Label>
                <Input id="cf_piva" {...register('cf_piva')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="codice_sdi">Codice SDI / PEC</Label>
                <Input id="codice_sdi" {...register('codice_sdi')} placeholder="es. XXXXXXX" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" {...register('nome')} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cognome">Cognome *</Label>
                <Input id="cognome" {...register('cognome')} />
              </div>
            </div>
            {errors.nome && (
              <p className="text-sm text-red-600">{errors.nome.message}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf_piva">Codice Fiscale</Label>
                <Input id="cf_piva" {...register('cf_piva')} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Contatti ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contatti</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" {...register('telefono')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && (
              <p className="text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Indirizzo ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Indirizzo</p>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="via">Via / Piazza</Label>
            <Input id="via" {...register('via')} placeholder="Via Roma" />
          </div>
          <div className="w-24 space-y-1.5">
            <Label htmlFor="civico">N. civico</Label>
            <Input id="civico" {...register('civico')} placeholder="10" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-28 space-y-1.5">
            <Label htmlFor="cap">CAP</Label>
            <Input id="cap" {...register('cap')} placeholder="00100" />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="citta">Città</Label>
            <Input id="citta" {...register('citta')} placeholder="Milano" />
          </div>
          <div className="w-20 space-y-1.5">
            <Label htmlFor="provincia">Prov.</Label>
            <Input id="provincia" {...register('provincia')} placeholder="MI" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nazione">Nazione</Label>
          <Input id="nazione" {...register('nazione')} placeholder="Italia" />
        </div>
      </div>

      {/* ── Altro ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Altro</p>
        <div className="space-y-1.5">
          <Label htmlFor="cantiere">Cantiere / Località</Label>
          <Input id="cantiere" {...register('cantiere')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" {...register('note')} rows={2} className="resize-none" />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Salvataggio...'
            : cliente
            ? 'Aggiorna cliente'
            : 'Crea cliente'}
        </Button>
      </div>
    </form>
  )
}
