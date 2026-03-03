import { getDashboardData } from '@/actions/dashboard'
import DashboardPage from '@/components/dashboard/DashboardPage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await getDashboardData()
  return <DashboardPage data={data} />
}
