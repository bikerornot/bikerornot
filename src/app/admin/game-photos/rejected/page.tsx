import { getRejectedGamePhotos, getGamePhotoStats } from '@/app/actions/game'
import RejectedPhotosClient from './RejectedPhotosClient'

export const metadata = { title: 'Rejected Game Photos — Admin' }

export default async function RejectedPhotosPage() {
  const [{ photos, total }, stats] = await Promise.all([
    getRejectedGamePhotos(1, 40),
    getGamePhotoStats(),
  ])

  return <RejectedPhotosClient initialPhotos={photos} initialTotal={total} initialStats={stats} />
}
