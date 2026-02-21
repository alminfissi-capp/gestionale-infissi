'use client'

import { useForm } from 'react-hook-form'
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
    formState: { errors, isSubmitting },
  } = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nome: cliente?.nome ?? '',
      cognome: cliente?.cognome ?? '',
      telefono: cliente?.telefono ?? '',
      email: cliente?.email ?? '',
      indirizzo: cliente?.indirizzo ?? '',
      cantiere: cliente?.cantiere ?? '',
      cf_piva: cliente?.cf_piva ?? '',
      note: cliente?.note ?? '',
    },
  })

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

      <div className="space-y-1.5">
        <Label htmlFor="indirizzo">Indirizzo</Label>
        <Input id="indirizzo" {...register('indirizzo')} />
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
