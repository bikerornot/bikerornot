import { getUsers } from '@/app/actions/admin'
import UsersClient from './UsersClient'

export const metadata = { title: 'Users — BikerOrNot Admin' }

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const { search = '', status = '', page = '1' } = await searchParams
  const { users, total, pageSize } = await getUsers({
    search,
    status,
    page: parseInt(page) || 1,
  })

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-zinc-500 text-sm mt-0.5">{total.toLocaleString()} total members</p>
      </div>
      <UsersClient
        initialUsers={users}
        total={total}
        pageSize={pageSize}
        initialSearch={search}
        initialStatus={status}
        initialPage={parseInt(page) || 1}
      />
    </div>
  )
}
