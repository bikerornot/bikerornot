import { listGameReports } from '@/app/actions/game-reports'
import GameReportsClient from './GameReportsClient'

export const metadata = { title: 'Game Reports — Admin' }

export default async function GameReportsPage() {
  const reports = await listGameReports()
  return <GameReportsClient initialReports={reports} />
}
