import { notFound } from 'next/navigation'
import { getAdminUserProfileBundle } from '@/app/actions/admin'
import UserDetailView from './UserDetailView'

export const metadata = { title: 'User Detail — BikerOrNot Admin' }

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const bundle = await getAdminUserProfileBundle(id)
  if (!bundle) notFound()

  return <UserDetailView bundle={bundle} />
}
