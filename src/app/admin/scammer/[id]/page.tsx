import { notFound } from 'next/navigation'
import { getScammerAnalysis } from '@/app/actions/admin'
import ScammerReport from './ScammerReport'

export const metadata = { title: 'Scammer Analysis — BikerOrNot Admin' }

export default async function ScammerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const analysis = await getScammerAnalysis(id)
  if (!analysis) notFound()

  return (
    <div className="p-6 max-w-4xl">
      <ScammerReport
        userId={id}
        profile={analysis.profile}
        result={analysis.result}
      />
    </div>
  )
}
