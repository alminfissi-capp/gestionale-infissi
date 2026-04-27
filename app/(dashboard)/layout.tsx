import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import { getMyPermissions } from '@/lib/permessi'
import LayoutShell from '@/components/layout/LayoutShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [settings, { isAdmin, permessi }] = await Promise.all([
    getSettings(),
    getMyPermissions(),
  ])

  const logoUrl = settings?.logo_url
    ? await getLogoSignedUrl(settings.logo_url)
    : null

  return (
    <LayoutShell
      logoUrl={logoUrl}
      denominazione={settings?.denominazione ?? null}
      permessi={permessi}
      isAdmin={isAdmin}
    >
      {children}
    </LayoutShell>
  )
}
