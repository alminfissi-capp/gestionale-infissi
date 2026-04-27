'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { UserPlus, Trash2, Shield, ShieldCheck, ShieldOff, Eye, Pencil, Loader2 } from 'lucide-react'
import { createUtente, deleteUtente, updatePermessiUtente } from '@/actions/utenti'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import type { UtenteConPermessi, ModuloApp, TipoAccesso } from '@/types/permessi'
import { MODULI_APP, MODULO_LABELS } from '@/types/permessi'

const ACCESSO_CONFIG: Record<TipoAccesso, { label: string; icon: React.ElementType; className: string }> = {
  nessuno:  { label: 'Nessuno',         icon: ShieldOff,   className: 'text-gray-400' },
  lettura:  { label: 'Solo lettura',    icon: Eye,         className: 'text-blue-600' },
  scrittura:{ label: 'Lettura+Scrittura',icon: ShieldCheck, className: 'text-green-600' },
}

interface Props {
  initialUtenti: UtenteConPermessi[]
}

export default function GestioneUtenti({ initialUtenti }: Props) {
  const [utenti, setUtenti] = useState(initialUtenti)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form nuovo utente
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!email.trim() || !password) {
      toast.error('Email e password sono obbligatorie')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Le password non coincidono')
      return
    }
    if (password.length < 6) {
      toast.error('La password deve essere almeno 6 caratteri')
      return
    }

    setCreating(true)
    const result = await createUtente(email.trim(), password, fullName.trim())
    setCreating(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('Utente creato')
    setDialogOpen(false)
    setEmail('')
    setFullName('')
    setPassword('')
    setConfirmPassword('')

    // Ricarica lista
    startTransition(() => {
      window.location.reload()
    })
  }

  const handleDelete = async () => {
    if (!deletingId) return
    const result = await deleteUtente(deletingId)
    setDeletingId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Utente eliminato')
    setUtenti((prev) => prev.filter((u) => u.id !== deletingId))
  }

  const handlePermessoChange = async (
    userId: string,
    modulo: ModuloApp,
    accesso: TipoAccesso
  ) => {
    const result = await updatePermessiUtente(userId, { [modulo]: accesso })
    if (result.error) {
      toast.error(result.error)
      return
    }
    setUtenti((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, permessi: { ...u.permessi, [modulo]: accesso } }
          : u
      )
    )
  }

  const operators = utenti.filter((u) => u.role === 'operator')
  const admins = utenti.filter((u) => u.role === 'admin')

  return (
    <div className="space-y-6">
      {/* Admin section */}
      {admins.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <CardTitle className="text-base">Amministratori</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {admins.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-2 px-3 bg-blue-50 rounded-lg">
                  <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.full_name || u.email}
                    </p>
                    {u.full_name && (
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 shrink-0">
                    Admin
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operatori */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Operatori</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Nuovo utente
        </Button>
      </div>

      {operators.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-500">Nessun operatore registrato</p>
            <Button className="mt-4" size="sm" onClick={() => setDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Aggiungi il primo operatore
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {operators.map((utente) => (
            <Card key={utente.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                    <span className="text-gray-600 text-sm font-bold">
                      {(utente.full_name || utente.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {utente.full_name || utente.email}
                    </p>
                    {utente.full_name && (
                      <p className="text-xs text-gray-500 truncate">{utente.email}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => setDeletingId(utente.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Permessi di accesso
                </p>
                <div className="space-y-2">
                  {MODULI_APP.map((modulo) => (
                    <div key={modulo} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-700 min-w-0 truncate">
                        {MODULO_LABELS[modulo]}
                      </span>
                      <Select
                        value={utente.permessi[modulo]}
                        onValueChange={(val) =>
                          handlePermessoChange(utente.id, modulo, val as TipoAccesso)
                        }
                      >
                        <SelectTrigger className="w-44 h-8 text-xs shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(ACCESSO_CONFIG) as [TipoAccesso, typeof ACCESSO_CONFIG[TipoAccesso]][]).map(
                            ([val, cfg]) => (
                              <SelectItem key={val} value={val}>
                                <div className="flex items-center gap-2">
                                  <cfg.icon className={`h-3.5 w-3.5 ${cfg.className}`} />
                                  <span>{cfg.label}</span>
                                </div>
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crea utente */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo operatore</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ut-name">Nome completo</Label>
              <Input
                id="ut-name"
                placeholder="es. Mario Rossi"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ut-email">Email *</Label>
              <Input
                id="ut-email"
                type="email"
                placeholder="email@esempio.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ut-pwd">Password *</Label>
              <Input
                id="ut-pwd"
                type="password"
                placeholder="min. 6 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ut-pwd2">Conferma password *</Label>
              <Input
                id="ut-pwd2"
                type="password"
                placeholder="ripeti la password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea utente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina utente</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;utente verrà eliminato definitivamente e non potrà più accedere al gestionale.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
