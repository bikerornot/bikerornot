import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSavedListings } from '@/app/actions/classifieds'
import SavedListingsClient from './SavedListingsClient'

export const metadata = { title: 'Saved Listings — BikerOrNot' }

export default async function SavedListingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('onboarding_complete').eq('id', user.id).single()
  if (!profile?.onboarding_complete) redirect('/onboarding')

  const saved = await getSavedListings()

  return <SavedListingsClient initialListings={saved} />
}
