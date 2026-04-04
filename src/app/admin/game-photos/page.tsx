import { getUnreviewedGamePhotos, getGamePhotoStats } from '@/app/actions/game'
import GamePhotosClient from './GamePhotosClient'

export const metadata = { title: 'Game Photos — Admin' }

export default async function GamePhotosPage() {
  const [photos, stats] = await Promise.all([
    getUnreviewedGamePhotos(20),
    getGamePhotoStats(),
  ])

  return <GamePhotosClient initialPhotos={photos} initialStats={stats} />
}
