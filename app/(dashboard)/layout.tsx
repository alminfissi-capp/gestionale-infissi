import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSettings, getLogoSignedUrl } from '@/actions/impostazioni'
import Sidebar from '@/components/layout/Sidebar'

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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar logoUrl={logoUrl} denominazione={settings?.denominazione ?? null} />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
