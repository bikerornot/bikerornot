import { getApprovedGamePhotos, getGamePhotoStats } from '@/app/actions/game'
import ApprovedPhotosClient from './ApprovedPhotosClient'

export const metadata = { title: 'Approved Game Photos — Admin' }

export default async function ApprovedPhotosPage() {
  const [{ photos, total }, stats] = await Promise.all([
    getApprovedGamePhotos(1, 40),
    getGamePhotoStats(),
  ])

  return <ApprovedPhotosClient initialPhotos={photos} initialTotal={total} initialStats={stats} />
}
