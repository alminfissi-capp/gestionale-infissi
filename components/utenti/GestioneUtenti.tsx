'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  UserPlus, Trash2, Shield, ShieldCheck, ShieldOff, Eye, Pencil,
  Loader2, KeyRound, UserX, UserCheck, Check, X,
} from 'lucide-react'
import { createUtente, deleteUtente, updatePermessiUtente, updatePasswordUtente, toggleDisableUtente } from '@/actions/utenti'
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
  nessuno:   { label: 'Nessuno',            icon: ShieldOff,   className: 'text-gray-400' },
  lettura:   { label: 'Solo lettura',       icon: Eye,         className: 'text-blue-600' },
  scrittura: { label: 'Lettura+Scrittura',  icon: ShieldCheck, className: 'text-green-600' },
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

  // Cambio password inline
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // Abilita/Disabilita
  const [togglingDisableId, setTogglingDisableId] = useState<string | null>(null)

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

  const handlePermessoChange = async (userId: string, modulo: ModuloApp, accesso: TipoAccesso) => {
    const result = await updatePermessiUtente(userId, { [modulo]: accesso })
    if (result.error) {
      toast.error(result.error)
      return
    }
    setUtenti((prev) =>
      prev.map((u) => u.id === userId ? { ...u, permessi: { ...u.permessi, [modulo]: accesso } } : u)
    )
  }

  const handleEditPassword = (userId: string) => {
    setEditingPasswordId(userId)
    setNewPassword('')
  }

  const handleCancelPassword = () => {
    setEditingPasswordId(null)
    setNewPassword('')
  }

  const handleSavePassword = async (userId: string) => {
    if (newPassword.length < 6) {
      toast.error('La password deve essere almeno 6 caratteri')
      return
    }
    setSavingPassword(true)
    const result = await updatePasswordUtente(userId, newPassword)
    setSavingPassword(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success('Password aggiornata')
    setEditingPasswordId(null)
    setNewPassword('')
  }

  const handleToggleDisable = async (userId: string, currentlyDisabled: boolean) => {
    setTogglingDisableId(userId)
    const result = await toggleDisableUtente(userId, !currentlyDisabled)
    setTogglingDisableId(null)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(currentlyDisabled ? 'Utente abilitato' : 'Utente disabilitato')
    setUtenti((prev) =>
      prev.map((u) => u.id === userId ? { ...u, disabled: !currentlyDisabled } : u)
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
            <Card key={utente.id} className={utente.disabled ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                {/* Riga principale: avatar + nome + pulsanti */}
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${utente.disabled ? 'bg-gray-100' : 'bg-gray-200'}`}>
                    <span className="text-gray-600 text-sm font-bold">
                      {(utente.full_name || utente.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {utente.full_name || utente.email}
                      </p>
                      {utente.disabled && (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-500 text-xs shrink-0">
                          Disabilitato
                        </Badge>
                      )}
                    </div>
                    {utente.full_name && (
                      <p className="text-xs text-gray-500 truncate">{utente.email}</p>
                    )}
                  </div>
                  {/* Pulsante abilita/disabilita */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={utente.disabled
                      ? 'text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0'
                      : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 shrink-0'}
                    onClick={() => handleToggleDisable(utente.id, utente.disabled)}
                    disabled={togglingDisableId === utente.id}
                    title={utente.disabled ? 'Abilita utente' : 'Disabilita utente'}
                  >
                    {togglingDisableId === utente.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : utente.disabled
                      ? <UserCheck className="h-4 w-4" />
                      : <UserX className="h-4 w-4" />}
                  </Button>
                  {/* Pulsante elimina */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => setDeletingId(utente.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {/* Riga password */}
                <div className="mt-3 flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  {editingPasswordId === utente.id ? (
                    <>
                      <Input
                        type="password"
                        placeholder="Nuova password (min. 6 caratteri)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-8 text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSavePassword(utente.id)
                          if (e.key === 'Escape') handleCancelPassword()
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8 px-3 shrink-0"
                        onClick={() => handleSavePassword(utente.id)}
                        disabled={savingPassword}
                      >
                        {savingPassword
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Check className="h-3.5 w-3.5" />}
                        <span className="ml-1">Salva</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 shrink-0"
                        onClick={handleCancelPassword}
                        disabled={savingPassword}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Input
                        type="text"
                        value="••••••••"
                        disabled
                        className="h-8 text-sm flex-1 bg-gray-50 text-gray-400 cursor-not-allowed select-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 shrink-0"
                        onClick={() => handleEditPassword(utente.id)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Modifica password
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>

              <Separator />

              <CardContent className="pt-0 px-0 pb-0">
                <div className="px-4 pt-4 pb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Permessi di accesso
                  </p>
                </div>
                <div>
                  {MODULI_APP.map((modulo, idx) => (
                    <div
                      key={modulo}
                      className={`flex items-center justify-between gap-2 px-4 py-2.5 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                    >
                      <span className="text-sm text-gray-700 min-w-0 flex-1">
                        {MODULO_LABELS[modulo]}
                      </span>
                      <Select
                        value={utente.permessi[modulo]}
                        onValueChange={(val) =>
                          handlePermessoChange(utente.id, modulo, val as TipoAccesso)
                        }
                        disabled={utente.disabled}
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
