'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { settingsSchema, type SettingsInput } from '@/lib/validations/impostazioniSchema'
import { saveSettings } from '@/actions/impostazioni'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  defaultValues: SettingsInput
}

export default function FormAzienda({ defaultValues }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  })

  const onSubmit = async (data: SettingsInput) => {
    try {
      await saveSettings(data)
      toast.success('Impostazioni salvate')
    } catch {
      toast.error('Errore nel salvataggio delle impostazioni')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="denominazione">Denominazione sociale</Label>
          <Input id="denominazione" {...register('denominazione')} placeholder="A.L.M. Infissi" />
          {errors.denominazione && (
            <p className="text-sm text-red-600">{errors.denominazione.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register('email')} placeholder="info@esempio.it" />
          {errors.email && (
            <p className="text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input id="indirizzo" {...register('indirizzo')} placeholder="Via Roma 1, 00100 Roma" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="piva">Partita IVA</Label>
          <Input id="piva" {...register('piva')} placeholder="IT12345678901" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="codice_fiscale">Codice Fiscale</Label>
          <Input id="codice_fiscale" {...register('codice_fiscale')} placeholder="RSSMRA80A01H501Z" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefono">Telefono</Label>
          <Input id="telefono" {...register('telefono')} placeholder="+39 06 12345678" />
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvataggio...' : 'Salva impostazioni'}
        </Button>
      </div>
    </form>
  )
}
