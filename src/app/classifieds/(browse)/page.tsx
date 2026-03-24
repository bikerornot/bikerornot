import { createClient } from '@/lib/supabase/server'
import ClassifiedsBrowseClient from './ClassifiedsBrowseClient'

export const metadata = { title: 'Classifieds — BikerOrNot' }

export default async function ClassifiedsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <ClassifiedsBrowseClient currentUserId={user?.id ?? null} />
}
