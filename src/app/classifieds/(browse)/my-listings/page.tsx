import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMyListings } from '@/app/actions/classifieds'
import MyListingsClient from './MyListingsClient'

export const metadata = { title: 'My Listings — BikerOrNot' }

export default async function MyListingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('onboarding_complete').eq('id', user.id).single()
  if (!profile?.onboarding_complete) redirect('/onboarding')

  const listings = await getMyListings()

  return <MyListingsClient initialListings={listings} />
}
