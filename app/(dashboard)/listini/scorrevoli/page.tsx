import { getScorevoliListino } from '@/actions/scorrevoli'
import ScorevoliEditor from './ScorevoliEditor'

export default async function ScorevoliPage() {
  const data = await getScorevoliListino()
  return <ScorevoliEditor initialData={data} />
}
