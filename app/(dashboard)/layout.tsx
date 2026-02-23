import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
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

  const settings = await getSettings()
  const logoUrl = settings?.logo_url
    ? await getLogoSignedUrl(settings.logo_url)
    : null

  return (
    <LayoutShell logoUrl={logoUrl} denominazione={settings?.denominazione ?? null}>
      {children}
    </LayoutShell>
  )
}
