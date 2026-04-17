'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) throw new Error('Not authorized')
  return user.id
}

export interface HdDealer {
  id: string
  hd_dealer_id: string
  hd_auth_code: string | null
  name: string
  dba_name: string | null
  address1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  phone: string | null
  fax: string | null
  email: string | null
  website: string | null
  latitude: number | null
  longitude: number | null
  hours_raw: string | null
  is_edealer: boolean | null
  has_buell: boolean | null
  has_no_bike: boolean | null
  online_rental: boolean | null
  offerings: unknown
  program_codes: unknown
  hog_info: unknown
  riders_edge_info: unknown
  test_ride_info: unknown
  commerce_info: unknown
  is_active: boolean
  source: string
  first_seen_at: string
  last_scraped_at: string
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

export interface HdDealerContact {
  id: string
  dealer_id: string
  name: string
  title: string | null
  title_normalized: string | null
  email: string | null
  phone_direct: string | null
  phone_mobile: string | null
  linkedin_url: string | null
  source: string | null
  source_url: string | null
  is_active: boolean
  verification_status: 'unverified' | 'verified' | 'stale' | 'bounced'
  first_seen_at: string
  last_verified_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DealerListFilters {
  search?: string
  state?: string | null
  country?: string | null
  active?: boolean | null
  limit?: number
  offset?: number
}

export interface DealerListResult {
  rows: HdDealer[]
  total: number
  contactCounts: Record<string, number>
}

export async function listDealers(filters: DealerListFilters = {}): Promise<DealerListResult> {
  await requireAdmin()
  const admin = getServiceClient()

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  let q = admin.from('hd_dealers').select('*', { count: 'exact' })

  if (filters.country) q = q.eq('country', filters.country)
  if (filters.state) q = q.eq('state', filters.state)
  if (filters.active != null) q = q.eq('is_active', filters.active)
  if (filters.search) {
    const term = filters.search.trim()
    if (term) {
      q = q.or(
        `name.ilike.%${term}%,city.ilike.%${term}%,hd_dealer_id.ilike.%${term}%,postal_code.ilike.%${term}%`
      )
    }
  }

  q = q.order('name', { ascending: true }).range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) throw new Error(`Failed to list dealers: ${error.message}`)

  const rows = (data ?? []) as HdDealer[]
  let contactCounts: Record<string, number> = {}
  if (rows.length > 0) {
    const { data: ccRows } = await admin
      .from('hd_dealer_contacts')
      .select('dealer_id')
      .in('dealer_id', rows.map((r) => r.id))
    for (const r of ccRows ?? []) {
      const id = (r as { dealer_id: string }).dealer_id
      contactCounts[id] = (contactCounts[id] ?? 0) + 1
    }
  }

  return { rows, total: count ?? 0, contactCounts }
}

export async function listDealerStates(country = 'USA'): Promise<string[]> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data } = await admin
    .from('hd_dealers')
    .select('state')
    .eq('country', country)
    .not('state', 'is', null)
  const set = new Set<string>()
  for (const r of data ?? []) {
    const s = (r as { state: string | null }).state
    if (s) set.add(s)
  }
  return Array.from(set).sort()
}

export async function getDealerById(id: string): Promise<{ dealer: HdDealer; contacts: HdDealerContact[] } | null> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data: dealer, error } = await admin.from('hd_dealers').select('*').eq('id', id).single()
  if (error || !dealer) return null
  const { data: contacts } = await admin
    .from('hd_dealer_contacts')
    .select('*')
    .eq('dealer_id', id)
    .order('created_at', { ascending: true })
  return {
    dealer: dealer as HdDealer,
    contacts: (contacts ?? []) as HdDealerContact[],
  }
}

export type DealerInput = Partial<Omit<HdDealer, 'id' | 'created_at' | 'updated_at' | 'first_seen_at' | 'last_scraped_at'>>

export async function createDealer(input: DealerInput & { hd_dealer_id: string; name: string }): Promise<HdDealer> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data, error } = await admin
    .from('hd_dealers')
    .insert({
      ...input,
      source: input.source ?? 'manual',
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Failed to create dealer: ${error.message}`)
  return data as HdDealer
}

export async function updateDealer(id: string, input: DealerInput): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const { error } = await admin.from('hd_dealers').update(input).eq('id', id)
  if (error) throw new Error(`Failed to update dealer: ${error.message}`)
}

export async function deleteDealer(id: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const { error } = await admin.from('hd_dealers').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete dealer: ${error.message}`)
}

export type ContactInput = Partial<Omit<HdDealerContact, 'id' | 'created_at' | 'updated_at' | 'first_seen_at' | 'dealer_id'>>

export async function createContact(dealerId: string, input: ContactInput & { name: string }): Promise<HdDealerContact> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data, error } = await admin
    .from('hd_dealer_contacts')
    .insert({
      dealer_id: dealerId,
      ...input,
      source: input.source ?? 'manual',
      verification_status: input.verification_status ?? 'unverified',
    })
    .select('*')
    .single()
  if (error) throw new Error(`Failed to create contact: ${error.message}`)
  return data as HdDealerContact
}

export async function updateContact(contactId: string, input: ContactInput): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const { error } = await admin.from('hd_dealer_contacts').update(input).eq('id', contactId)
  if (error) throw new Error(`Failed to update contact: ${error.message}`)
}

export async function deleteContact(contactId: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const { error } = await admin.from('hd_dealer_contacts').delete().eq('id', contactId)
  if (error) throw new Error(`Failed to delete contact: ${error.message}`)
}

export async function getDealerStats(): Promise<{
  total: number
  us: number
  active: number
  contacts: number
}> {
  await requireAdmin()
  const admin = getServiceClient()
  const [{ count: total }, { count: us }, { count: active }, { count: contacts }] = await Promise.all([
    admin.from('hd_dealers').select('*', { count: 'exact', head: true }),
    admin.from('hd_dealers').select('*', { count: 'exact', head: true }).eq('country', 'USA'),
    admin.from('hd_dealers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('hd_dealer_contacts').select('*', { count: 'exact', head: true }),
  ])
  return {
    total: total ?? 0,
    us: us ?? 0,
    active: active ?? 0,
    contacts: contacts ?? 0,
  }
}
