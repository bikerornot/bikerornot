import { listModerationRejections } from '@/app/actions/moderation-rejections'
import ModerationRejectionsClient from './ModerationRejectionsClient'

export const metadata = { title: 'Moderation Rejections — BikerOrNot Admin' }
export const dynamic = 'force-dynamic'

export default async function ModerationRejectionsPage() {
  const rows = await listModerationRejections()
  return <ModerationRejectionsClient initialRows={rows} />
}
