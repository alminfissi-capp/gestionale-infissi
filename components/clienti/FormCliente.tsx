'use client'

import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Tipo cliente */}
      <div className="flex gap-2">
        <label className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md border cursor-pointer text-sm font-medium transition-colors ${tipo === 'privato' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          <input type="radio" value="privato" {...register('tipo')} className="sr-only" />
          Privato
        </label>
        <label className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md border cursor-pointer text-sm font-medium transition-colors ${tipo === 'azienda' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          <input type="radio" value="azienda" {...register('tipo')} className="sr-only" />
          Azienda
        </label>
      </div>

      {/* Ragione sociale (azienda) o Nome+Cognome (privato) */}
      {tipo === 'azienda' ? (
        <div className="space-y-1.5">
          <Label htmlFor="ragione_sociale">Ragione sociale</Label>
          <Input id="ragione_sociale" {...register('ragione_sociale')} />
          {errors.ragione_sociale && (
            <p className="text-sm text-red-600">{errors.ragione_sociale.message}</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" {...register('nome')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cognome">Cognome</Label>
              <Input id="cognome" {...register('cognome')} />
            </div>
          </div>
          {errors.nome && (
            <p className="text-sm text-red-600">{errors.nome.message}</p>
          )}
        </>
      )}

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

      {/* Indirizzo strutturato */}
      <div className="space-y-2">
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

      {/* Codice SDI */}
      <div className="space-y-1.5">
        <Label htmlFor="codice_sdi">Codice SDI / PEC (fatturazione)</Label>
        <Input id="codice_sdi" {...register('codice_sdi')} placeholder="es. XXXXXXX" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cantiere">Cantiere / Località</Label>
          <Input id="cantiere" {...register('cantiere')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf_piva">CF / Partita IVA</Label>
          <Input id="cf_piva" {...register('cf_piva')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" {...register('note')} rows={2} className="resize-none" />
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
