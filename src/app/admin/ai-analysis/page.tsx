import { getSuspiciousProfiles } from '@/app/actions/ai-analysis'
import AiAnalysisClient from './AiAnalysisClient'

export const metadata = { title: 'AI Analysis — Admin' }

export default async function AiAnalysisPage() {
  const profiles = await getSuspiciousProfiles()
  return <AiAnalysisClient initialProfiles={profiles} />
}
