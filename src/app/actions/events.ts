'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validateImageFile, checkRateLimit } from '@/lib/rate-limit'
import { moderateImage } from '@/lib/sightengine'
import { notifyIfActive } from '@/lib/notify'
import { geocodeZip, geocodeAddress } from '@/lib/geocode'

async function refreshEventCounts(admin: ReturnType<typeof getServiceClient>, eventId: string) {
  const [{ count: goingCount }, { count: interestedCount }] = await Promise.all([
    admin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'going'),
    admin.from('event_rsvps').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'interested'),
  ])
  await admin.from('events').update({
    going_count: goingCount ?? 0,
    interested_count: interestedCount ?? 0,
  }).eq('id', eventId)
}

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

async function checkPrivateGroupAccess(admin: ReturnType<typeof getServiceClient>, groupId: string | null, userId: string) {
  if (!groupId) return
  const { data: group } = await admin.from('groups').select('privacy').eq('id', groupId).single()
  if (group?.privacy === 'private') {
    const { data: membership } = await admin
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()
    if (!membership) throw new Error('Not authorized')
  }
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

// ─── Types ─────────────────────────────────────────────────

export type EventType = 'ride' | 'event'
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed'
export type RsvpStatus = 'going' | 'interested'
export type RecurrenceRule = 'weekly' | 'biweekly' | 'monthly'
export type EventCategory =
  | 'group_ride' | 'rally' | 'charity' | 'bike_night'
  | 'show' | 'swap_meet' | 'meetup' | 'poker_run' | 'scenic_tour' | 'other'

export interface EventStop {
  id: string
  event_id: string
  order_index: number
  label: string | null
  address: string
  city: string | null
  state: string | null
  zip_code: string | null
  latitude: number | null
  longitude: number | null
}

export interface EventDetail {
  id: string
  type: EventType
  creator_id: string
  group_id: string | null
  title: string
  slug: string
  description: string | null
  cover_photo_url: string | null
  flyer_url: string | null
  category: EventCategory | null
  starts_at: string
  ends_at: string | null
  timezone: string
  recurrence_rule: RecurrenceRule | null
  recurrence_parent_id: string | null
  recurrence_index: number | null
  venue_name: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  latitude: number | null
  longitude: number | null
  end_address: string | null
  end_city: string | null
  end_state: string | null
  end_zip_code: string | null
  end_latitude: number | null
  end_longitude: number | null
  estimated_distance_miles: number | null
  max_attendees: number | null
  status: EventStatus
  cancelled_reason: string | null
  going_count: number
  interested_count: number
  created_at: string
  updated_at: string
  creator?: any
  group?: { id: string; name: string; slug: string } | null
  stops?: EventStop[]
  my_rsvp?: RsvpStatus | null
}

export interface CreateEventInput {
  type: EventType
  title: string
  description?: string | null
  category?: EventCategory | null
  starts_at: string
  ends_at?: string | null
  timezone?: string
  recurrence_rule?: RecurrenceRule | null
  group_id?: string | null
  // Location (event venue or ride start)
  venue_name?: string | null
  address?: string | null
  zip_code?: string | null
  // Ride end
  end_address?: string | null
  end_zip_code?: string | null
  // Capacity
  max_attendees?: number | null
  // Stops (rides only)
  stops?: { label?: string | null; address: string; zip_code?: string | null }[]
}

// ─── Create ────────────────────────────────────────────────

export async function createEvent(
  input: CreateEventInput,
  coverFile?: File | null,
  flyerFile?: File | null
): Promise<EventDetail> {
  const user = await requireAuth()

  // Rate limit: 5 events per hour
  checkRateLimit(`create-event:${user.id}`, 5, 3600000)

  if (!input.title.trim()) throw new Error('Title is required')
  if (input.title.trim().length > 150) throw new Error('Title too long (max 150 characters)')
  if (input.description && input.description.length > 5000) throw new Error('Description too long (max 5000 characters)')

  const admin = getServiceClient()

  // If group event, verify membership
  if (input.group_id) {
    const { data: membership } = await admin
      .from('group_members')
      .select('id')
      .eq('group_id', input.group_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()
    if (!membership) throw new Error('You must be an active group member to create events')
  }

  // Generate unique slug
  const base = slugify(input.title) || 'event'
  let slug = base
  const { data: existing } = await admin.from('events').select('slug').eq('slug', slug).single()
  if (existing) {
    slug = `${base}-${randomSuffix()}`
  }

  // Upload cover photo
  let cover_photo_url: string | null = null
  if (coverFile && coverFile.size > 0) {
    validateImageFile(coverFile)
    const ext = coverFile.name.split('.').pop() ?? 'jpg'
    const path = `events/${user.id}/${slug}.${ext}`
    const bytes = await coverFile.arrayBuffer()
    const moderation = await moderateImage(bytes, coverFile.type)
    if (moderation === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: coverFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    cover_photo_url = path
  }

  // Upload flyer image
  let flyer_url: string | null = null
  if (flyerFile && flyerFile.size > 0) {
    validateImageFile(flyerFile)
    const ext = flyerFile.name.split('.').pop() ?? 'jpg'
    const path = `events/${user.id}/${slug}-flyer.${ext}`
    const bytes = await flyerFile.arrayBuffer()
    const moderation = await moderateImage(bytes, flyerFile.type)
    if (moderation === 'rejected') throw new Error('Flyer image was rejected by our content filter. Please choose a different image.')
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: flyerFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    flyer_url = path
  }

  // Geocode start location — try full address first, fall back to zip
  let latitude: number | null = null
  let longitude: number | null = null
  let city: string | null = null
  let state: string | null = null
  if (input.address && input.zip_code) {
    const geo = await geocodeAddress(input.address, input.zip_code)
    if (geo) {
      latitude = geo.lat
      longitude = geo.lng
    }
  }
  if (input.zip_code) {
    const zipGeo = await geocodeZip(input.zip_code)
    if (zipGeo) {
      if (!latitude) { latitude = zipGeo.lat; longitude = zipGeo.lng }
      city = zipGeo.city
      state = zipGeo.state
    }
  }

  // Geocode ride end location — try full address first, fall back to zip
  let end_latitude: number | null = null
  let end_longitude: number | null = null
  let end_city: string | null = null
  let end_state: string | null = null
  if (input.type === 'ride' && input.end_address && input.end_zip_code) {
    const geo = await geocodeAddress(input.end_address, input.end_zip_code)
    if (geo) {
      end_latitude = geo.lat
      end_longitude = geo.lng
    }
  }
  if (input.type === 'ride' && input.end_zip_code) {
    const zipGeo = await geocodeZip(input.end_zip_code)
    if (zipGeo) {
      if (!end_latitude) { end_latitude = zipGeo.lat; end_longitude = zipGeo.lng }
      end_city = zipGeo.city
      end_state = zipGeo.state
    }
  }

  // Insert event
  const { data: event, error } = await admin
    .from('events')
    .insert({
      type: input.type,
      creator_id: user.id,
      group_id: input.group_id || null,
      title: input.title.trim(),
      slug,
      description: input.description?.trim() || null,
      cover_photo_url,
      flyer_url,
      category: input.category || null,
      starts_at: input.starts_at,
      ends_at: input.ends_at || null,
      timezone: input.timezone || 'America/New_York',
      recurrence_rule: input.recurrence_rule || null,
      venue_name: input.venue_name?.trim() || null,
      address: input.address?.trim() || null,
      city, state,
      zip_code: input.zip_code?.trim() || null,
      latitude, longitude,
      end_address: input.type === 'ride' ? (input.end_address?.trim() || null) : null,
      end_city: input.type === 'ride' ? end_city : null,
      end_state: input.type === 'ride' ? end_state : null,
      end_zip_code: input.type === 'ride' ? (input.end_zip_code?.trim() || null) : null,
      end_latitude: input.type === 'ride' ? end_latitude : null,
      end_longitude: input.type === 'ride' ? end_longitude : null,
      max_attendees: input.max_attendees || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Insert stops for rides
  if (input.type === 'ride' && input.stops?.length) {
    const stopRows = await Promise.all(
      input.stops.map(async (s, i) => {
        let sLat: number | null = null
        let sLng: number | null = null
        let sCity: string | null = null
        let sState: string | null = null
        if (s.address && s.zip_code) {
          const addrGeo = await geocodeAddress(s.address, s.zip_code)
          if (addrGeo) { sLat = addrGeo.lat; sLng = addrGeo.lng }
        }
        if (s.zip_code) {
          const zipGeo = await geocodeZip(s.zip_code)
          if (zipGeo) { if (!sLat) { sLat = zipGeo.lat; sLng = zipGeo.lng }; sCity = zipGeo.city; sState = zipGeo.state }
        }
        return {
          event_id: event.id,
          order_index: i,
          label: s.label?.trim() || null,
          address: s.address.trim(),
          city: sCity, state: sState,
          zip_code: s.zip_code?.trim() || null,
          latitude: sLat, longitude: sLng,
        }
      })
    )
    await admin.from('event_stops').insert(stopRows)
  }

  // Generate recurrence instances
  if (input.recurrence_rule) {
    await generateRecurrenceInstances(event.id, input.recurrence_rule, admin)
  }

  // Auto-create a feed post for this event
  await admin.from('posts').insert({
    author_id: user.id,
    group_id: input.group_id || null,
    event_id: event.id,
    content: input.type === 'ride'
      ? `Created a new ride: ${input.title.trim()}`
      : `Created a new event: ${input.title.trim()}`,
  })

  // Auto-RSVP creator as going
  await admin.from('event_rsvps').insert({
    event_id: event.id,
    user_id: user.id,
    status: 'going',
  })
  await admin.from('events').update({ going_count: 1 }).eq('id', event.id)

  return event as EventDetail
}

// ─── Recurrence ────────────────────────────────────────────

async function generateRecurrenceInstances(
  parentId: string,
  rule: RecurrenceRule,
  admin: ReturnType<typeof getServiceClient>
) {
  const { data: parent } = await admin.from('events').select('*').eq('id', parentId).single()
  if (!parent) return

  const count = rule === 'weekly' ? 12 : rule === 'biweekly' ? 6 : 4
  const dayInterval = rule === 'weekly' ? 7 : rule === 'biweekly' ? 14 : 0

  // Get stops if ride
  const { data: parentStops } = await admin
    .from('event_stops')
    .select('*')
    .eq('event_id', parentId)
    .order('order_index')

  for (let i = 1; i <= count; i++) {
    const startDate = new Date(parent.starts_at)
    const endDate = parent.ends_at ? new Date(parent.ends_at) : null

    if (rule === 'monthly') {
      startDate.setMonth(startDate.getMonth() + i)
      if (endDate) endDate.setMonth(endDate.getMonth() + i)
    } else {
      startDate.setDate(startDate.getDate() + dayInterval * i)
      if (endDate) endDate.setDate(endDate.getDate() + dayInterval * i)
    }

    const instanceSlug = `${parent.slug}-${i}`

    const { data: instance } = await admin
      .from('events')
      .insert({
        type: parent.type,
        creator_id: parent.creator_id,
        group_id: parent.group_id,
        title: parent.title,
        slug: instanceSlug,
        description: parent.description,
        cover_photo_url: parent.cover_photo_url,
        flyer_url: parent.flyer_url,
        category: parent.category,
        starts_at: startDate.toISOString(),
        ends_at: endDate ? endDate.toISOString() : null,
        timezone: parent.timezone,
        recurrence_parent_id: parentId,
        recurrence_index: i,
        venue_name: parent.venue_name,
        address: parent.address,
        city: parent.city,
        state: parent.state,
        zip_code: parent.zip_code,
        latitude: parent.latitude,
        longitude: parent.longitude,
        end_address: parent.end_address,
        end_city: parent.end_city,
        end_state: parent.end_state,
        end_zip_code: parent.end_zip_code,
        end_latitude: parent.end_latitude,
        end_longitude: parent.end_longitude,
        estimated_distance_miles: parent.estimated_distance_miles,
        max_attendees: parent.max_attendees,
        status: parent.status,
      })
      .select('id')
      .single()

    // Copy stops for ride instances
    if (instance && parentStops?.length) {
      const stopCopies = parentStops.map((s: any) => ({
        event_id: instance.id,
        order_index: s.order_index,
        label: s.label,
        address: s.address,
        city: s.city,
        state: s.state,
        zip_code: s.zip_code,
        latitude: s.latitude,
        longitude: s.longitude,
      }))
      await admin.from('event_stops').insert(stopCopies)
    }
  }
}

// ─── Read ──────────────────────────────────────────────────

export async function getEvent(slug: string): Promise<EventDetail | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getServiceClient()

  const { data: event } = await admin
    .from('events')
    .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url, phone_verified_at)')
    .eq('slug', slug)
    .single()

  if (!event) return null

  // Check private group access
  if (user) {
    await checkPrivateGroupAccess(admin, event.group_id, user.id)
  } else if (event.group_id) {
    // Unauthenticated users can't see group events at all
    const { data: group } = await admin.from('groups').select('privacy').eq('id', event.group_id).single()
    if (group?.privacy === 'private') return null
  }

  // Get group info if group event
  let group: { id: string; name: string; slug: string } | null = null
  if (event.group_id) {
    const { data: g } = await admin
      .from('groups')
      .select('id, name, slug')
      .eq('id', event.group_id)
      .single()
    group = g
  }

  // Get stops for rides
  let stops: EventStop[] = []
  if (event.type === 'ride') {
    const { data: s } = await admin
      .from('event_stops')
      .select('*')
      .eq('event_id', event.id)
      .order('order_index')
    stops = (s ?? []) as EventStop[]
  }

  // Get user's RSVP status
  let my_rsvp: RsvpStatus | null = null
  if (user) {
    const { data: rsvp } = await admin
      .from('event_rsvps')
      .select('status')
      .eq('event_id', event.id)
      .eq('user_id', user.id)
      .single()
    if (rsvp) my_rsvp = rsvp.status as RsvpStatus
  }

  return {
    ...event,
    group,
    stops,
    my_rsvp,
  } as EventDetail
}

export async function getEvents(): Promise<{
  events: EventDetail[]
  userLat: number | null
  userLng: number | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getServiceClient()

  const { data: events } = await admin
    .from('events')
    .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url, phone_verified_at)')
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(100)

  let userLat: number | null = null
  let userLng: number | null = null
  let myRsvps: Record<string, RsvpStatus> = {}

  if (user) {
    const [{ data: profile }, { data: rsvps }] = await Promise.all([
      admin.from('profiles').select('latitude, longitude').eq('id', user.id).single(),
      admin.from('event_rsvps').select('event_id, status').eq('user_id', user.id),
    ])
    userLat = profile?.latitude ?? null
    userLng = profile?.longitude ?? null
    for (const r of rsvps ?? []) {
      myRsvps[r.event_id] = r.status as RsvpStatus
    }
  }

  return {
    events: (events ?? []).map((e) => ({
      ...e,
      my_rsvp: myRsvps[e.id] ?? null,
    })) as EventDetail[],
    userLat,
    userLng,
  }
}

export async function getRecentEvents(): Promise<EventDetail[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getServiceClient()

  const { data: events } = await admin
    .from('events')
    .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url, phone_verified_at)')
    .in('status', ['published', 'completed'])
    .order('created_at', { ascending: false })
    .limit(10)

  let myRsvps: Record<string, RsvpStatus> = {}
  if (user) {
    const eventIds = (events ?? []).map((e) => e.id)
    if (eventIds.length > 0) {
      const { data: rsvps } = await admin
        .from('event_rsvps')
        .select('event_id, status')
        .eq('user_id', user.id)
        .in('event_id', eventIds)
      for (const r of rsvps ?? []) {
        myRsvps[r.event_id] = r.status as RsvpStatus
      }
    }
  }

  return (events ?? []).map((e) => ({
    ...e,
    my_rsvp: myRsvps[e.id] ?? null,
  })) as EventDetail[]
}

export async function getGroupEvents(groupId: string): Promise<EventDetail[]> {
  const user = await requireAuth()
  const admin = getServiceClient()

  await checkPrivateGroupAccess(admin, groupId, user.id)

  const { data } = await admin
    .from('events')
    .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url)')
    .eq('group_id', groupId)
    .in('status', ['published', 'cancelled', 'completed'])
    .order('starts_at', { ascending: true })
    .limit(50)

  return (data ?? []) as EventDetail[]
}

export async function getUserEvents(): Promise<EventDetail[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  // Get events I created + events I RSVP'd to
  const [{ data: created }, { data: rsvps }] = await Promise.all([
    admin
      .from('events')
      .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url)')
      .eq('creator_id', user.id)
      .in('status', ['published', 'draft'])
      .order('starts_at', { ascending: true })
      .limit(50),
    admin
      .from('event_rsvps')
      .select('event_id')
      .eq('user_id', user.id),
  ])

  const rsvpEventIds = (rsvps ?? []).map((r) => r.event_id)
  const createdIds = new Set((created ?? []).map((e) => e.id))

  // Fetch RSVP'd events not already in created list
  const missingIds = rsvpEventIds.filter((id) => !createdIds.has(id))
  let rsvpEvents: any[] = []
  if (missingIds.length > 0) {
    const { data } = await admin
      .from('events')
      .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url)')
      .in('id', missingIds)
      .in('status', ['published'])
      .order('starts_at', { ascending: true })
    rsvpEvents = data ?? []
  }

  // Merge and sort by starts_at
  const all = [...(created ?? []), ...rsvpEvents].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )

  return all as EventDetail[]
}

// ─── Update ────────────────────────────────────────────────

export async function updateEvent(
  eventId: string,
  input: Partial<CreateEventInput>,
  coverFile?: File | null,
  flyerFile?: File | null
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Input validation
  if (input.title !== undefined && !input.title.trim()) throw new Error('Title is required')
  if (input.title !== undefined && input.title.trim().length > 150) throw new Error('Title too long (max 150 characters)')
  if (input.description !== undefined && input.description && input.description.length > 5000) throw new Error('Description too long (max 5000 characters)')

  const admin = getServiceClient()

  // Check ownership or group admin
  const { data: event } = await admin.from('events').select('creator_id, group_id').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')

  let authorized = event.creator_id === user.id
  if (!authorized && event.group_id) {
    const { data: membership } = await admin
      .from('group_members')
      .select('role')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()
    if (membership?.role === 'admin') authorized = true
  }
  if (!authorized) throw new Error('Not authorized')

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  if (input.title !== undefined) updates.title = input.title.trim()
  if (input.description !== undefined) updates.description = input.description?.trim() || null
  if (input.category !== undefined) updates.category = input.category || null
  if (input.starts_at !== undefined) updates.starts_at = input.starts_at
  if (input.ends_at !== undefined) updates.ends_at = input.ends_at || null
  if (input.timezone !== undefined) updates.timezone = input.timezone
  if (input.venue_name !== undefined) updates.venue_name = input.venue_name?.trim() || null
  if (input.address !== undefined) updates.address = input.address?.trim() || null
  if (input.max_attendees !== undefined) updates.max_attendees = input.max_attendees || null

  // Re-geocode start if zip changed
  if (input.zip_code !== undefined) {
    updates.zip_code = input.zip_code?.trim() || null
    if (input.zip_code) {
      const geo = await geocodeZip(input.zip_code)
      if (geo) {
        updates.latitude = geo.lat
        updates.longitude = geo.lng
        updates.city = geo.city
        updates.state = geo.state
      }
    }
  }

  // Ride end location
  if (input.end_address !== undefined) updates.end_address = input.end_address?.trim() || null
  if (input.end_zip_code !== undefined) {
    updates.end_zip_code = input.end_zip_code?.trim() || null
    if (input.end_zip_code) {
      const geo = await geocodeZip(input.end_zip_code)
      if (geo) {
        updates.end_latitude = geo.lat
        updates.end_longitude = geo.lng
        updates.end_city = geo.city
        updates.end_state = geo.state
      }
    }
  }

  // Ride stops: delete and re-insert
  if (input.stops !== undefined) {
    await admin.from('event_stops').delete().eq('event_id', eventId)
    const validStops = (input.stops ?? []).filter((s) => s.address.trim())
    if (validStops.length > 0) {
      const stopRows = await Promise.all(
        validStops.map(async (s, i) => {
          let sLat: number | null = null
          let sLng: number | null = null
          let sCity: string | null = null
          let sState: string | null = null
          if (s.zip_code) {
            const geo = await geocodeZip(s.zip_code)
            if (geo) { sLat = geo.lat; sLng = geo.lng; sCity = geo.city; sState = geo.state }
          }
          return {
            event_id: eventId,
            order_index: i,
            label: s.label?.trim() || null,
            address: s.address.trim(),
            city: sCity, state: sState,
            zip_code: s.zip_code?.trim() || null,
            latitude: sLat, longitude: sLng,
          }
        })
      )
      await admin.from('event_stops').insert(stopRows)
    }
  }

  // Cover photo update
  if (coverFile && coverFile.size > 0) {
    validateImageFile(coverFile)
    const ext = coverFile.name.split('.').pop() ?? 'jpg'
    const path = `events/${user.id}/${eventId}.${ext}`
    const bytes = await coverFile.arrayBuffer()
    const moderation = await moderateImage(bytes, coverFile.type)
    if (moderation === 'rejected') throw new Error('This image was rejected by our content filter.')
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: coverFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    updates.cover_photo_url = path
  }

  // Flyer upload
  if (flyerFile && flyerFile.size > 0) {
    validateImageFile(flyerFile)
    const ext = flyerFile.name.split('.').pop() ?? 'jpg'
    const path = `events/${user.id}/${eventId}-flyer.${ext}`
    const bytes = await flyerFile.arrayBuffer()
    const moderation = await moderateImage(bytes, flyerFile.type)
    if (moderation === 'rejected') throw new Error('Flyer image was rejected by our content filter.')
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: flyerFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    updates.flyer_url = path
  }

  const { error } = await admin.from('events').update(updates).eq('id', eventId)
  if (error) throw new Error(error.message)

  // Notify attendees of update
  const { data: attendees } = await admin
    .from('event_rsvps')
    .select('user_id')
    .eq('event_id', eventId)
    .neq('user_id', user.id)

  if (attendees?.length) {
    const notifications = attendees.map((a) => ({
      user_id: a.user_id,
      type: 'event_update',
      actor_id: user.id,
      event_id: eventId,
    }))
    await notifyIfActive(user.id, notifications)
  }
}

export async function cancelEvent(eventId: string, reason?: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: event } = await admin.from('events').select('creator_id, group_id, title').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')

  let authorized = event.creator_id === user.id
  if (!authorized && event.group_id) {
    const { data: membership } = await admin
      .from('group_members')
      .select('role')
      .eq('group_id', event.group_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()
    if (membership?.role === 'admin') authorized = true
  }
  if (!authorized) throw new Error('Not authorized')

  await admin.from('events').update({
    status: 'cancelled',
    cancelled_reason: reason?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', eventId)

  // Notify all attendees
  const { data: attendees } = await admin
    .from('event_rsvps')
    .select('user_id')
    .eq('event_id', eventId)
    .neq('user_id', user.id)

  if (attendees?.length) {
    const notifications = attendees.map((a) => ({
      user_id: a.user_id,
      type: 'event_cancelled',
      actor_id: user.id,
      event_id: eventId,
    }))
    await notifyIfActive(user.id, notifications)
  }
}

// ─── RSVP ──────────────────────────────────────────────────

export async function rsvpEvent(eventId: string, status: RsvpStatus): Promise<{ error?: string }> {
  const user = await requireAuth()

  // Rate limit: 20 RSVP actions per minute
  checkRateLimit(`rsvp:${user.id}`, 20, 60000)

  const admin = getServiceClient()

  // Check event exists and is published
  const { data: event } = await admin
    .from('events')
    .select('id, status, max_attendees, going_count, creator_id, group_id')
    .eq('id', eventId)
    .single()
  if (!event || event.status !== 'published') return { error: 'Event not available' }

  // Check private group membership
  await checkPrivateGroupAccess(admin, event.group_id, user.id)

  // If trying to go and at capacity, force to interested
  let finalStatus = status
  if (status === 'going' && event.max_attendees && event.going_count >= event.max_attendees) {
    // Allow creator to always go
    if (user.id !== event.creator_id) {
      finalStatus = 'interested'
    }
  }

  // Check for existing RSVP
  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    if (existing.status === finalStatus) return {} // No change
    await admin.from('event_rsvps').update({
      status: finalStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)

    await refreshEventCounts(admin, eventId)
  } else {
    await admin.from('event_rsvps').insert({
      event_id: eventId,
      user_id: user.id,
      status: finalStatus,
    })

    await refreshEventCounts(admin, eventId)

    // Notify event creator
    if (finalStatus === 'going' && user.id !== event.creator_id) {
      await notifyIfActive(user.id, {
        user_id: event.creator_id,
        type: 'event_rsvp',
        actor_id: user.id,
        event_id: eventId,
      })
    }
  }

  return finalStatus !== status ? { error: 'Event is full — marked as Interested instead' } : {}
}

export async function cancelRsvp(eventId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .single()

  if (!rsvp) return

  await admin.from('event_rsvps').delete().eq('id', rsvp.id)
  await refreshEventCounts(admin, eventId)
}

export async function getEventAttendees(
  eventId: string,
  status?: RsvpStatus
): Promise<any[]> {
  await requireAuth()
  const admin = getServiceClient()

  let query = admin
    .from('event_rsvps')
    .select('status, user:profiles!user_id(id, username, first_name, last_name, profile_photo_url, phone_verified_at, status)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (status) {
    query = query.eq('status', status)
  }

  const { data } = await query.limit(100)

  // Filter out banned/deactivated users
  return (data ?? []).filter((r: any) => r.user?.status === 'active')
}

// ─── Invites ───────────────────────────────────────────────

export async function inviteFriendsToEvent(
  eventId: string,
  userIds: string[]
): Promise<{ sent: number; skipped: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (userIds.length === 0) return { sent: 0, skipped: 0 }

  const admin = getServiceClient()

  // Rate limit: 50 invites per day
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  const { count: sentToday } = await admin
    .from('event_invites')
    .select('*', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', dayAgo)
  if ((sentToday ?? 0) + userIds.length > 50) throw new Error('Daily invite limit reached (50/day)')

  // Verify caller is actually friends with all invited users
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
  const friendIds = new Set((friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  ))
  const verifiedIds = userIds.filter((id) => friendIds.has(id))
  if (verifiedIds.length === 0) return { sent: 0, skipped: userIds.length }

  // Get existing invites + RSVPs to skip
  const [{ data: existingInvites }, { data: existingRsvps }] = await Promise.all([
    admin.from('event_invites').select('invited_user_id').eq('event_id', eventId),
    admin.from('event_rsvps').select('user_id').eq('event_id', eventId),
  ])

  const skipSet = new Set([
    ...(existingInvites ?? []).map((i) => i.invited_user_id),
    ...(existingRsvps ?? []).map((r) => r.user_id),
  ])

  const toInvite = verifiedIds.filter((id) => !skipSet.has(id))

  if (toInvite.length === 0) return { sent: 0, skipped: userIds.length }

  const rows = toInvite.map((id) => ({
    event_id: eventId,
    invited_user_id: id,
    invited_by: user.id,
  }))

  await admin.from('event_invites').insert(rows)

  // Send notifications
  const notifications = toInvite.map((id) => ({
    user_id: id,
    type: 'event_invite',
    actor_id: user.id,
    event_id: eventId,
  }))
  await notifyIfActive(user.id, notifications)

  return { sent: toInvite.length, skipped: userIds.length - toInvite.length }
}

export async function respondToEventInvite(eventId: string, accept: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  await admin.from('event_invites').update({
    status: accept ? 'accepted' : 'declined',
    responded_at: new Date().toISOString(),
  })
    .eq('event_id', eventId)
    .eq('invited_user_id', user.id)
    .eq('status', 'pending')

  // Auto-RSVP as interested on accept
  if (accept) {
    await rsvpEvent(eventId, 'interested')
  }
}

export async function shareEventToGroup(eventId: string, groupId: string): Promise<void> {
  const user = await requireAuth()

  // Rate limit: 10 shares per hour
  checkRateLimit(`share-event:${user.id}`, 10, 3600000)

  const admin = getServiceClient()

  // Verify user is group member
  const { data: membership } = await admin
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()
  if (!membership) throw new Error('You must be a group member to share events')

  // Get event title
  const { data: event } = await admin.from('events').select('title, type').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')

  // Create post in group
  await admin.from('posts').insert({
    author_id: user.id,
    group_id: groupId,
    event_id: eventId,
    content: event.type === 'ride'
      ? `Shared a ride: ${event.title}`
      : `Shared an event: ${event.title}`,
  })
}

export interface InvitableFriend {
  id: string
  username: string | null
  first_name: string | null
  last_name: string | null
  profile_photo_url: string | null
  phone_verified_at: string | null
  distance_miles: number | null
}

export async function getFriendsNotInvitedToEvent(eventId: string): Promise<InvitableFriend[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  // Get event location + friends + already invited/RSVP'd in parallel
  const [{ data: event }, { data: friendships }, { data: invited }, { data: rsvpd }] = await Promise.all([
    admin.from('events').select('latitude, longitude').eq('id', eventId).single(),
    admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin.from('event_invites').select('invited_user_id').eq('event_id', eventId),
    admin.from('event_rsvps').select('user_id').eq('event_id', eventId),
  ])

  const friendIds = (friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  if (friendIds.length === 0) return []

  const excludeSet = new Set([
    ...(invited ?? []).map((i) => i.invited_user_id),
    ...(rsvpd ?? []).map((r) => r.user_id),
  ])

  const eligibleIds = friendIds.filter((id) => !excludeSet.has(id))
  if (eligibleIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, phone_verified_at, latitude, longitude')
    .in('id', eligibleIds.slice(0, 200))
    .eq('status', 'active')
    .is('deactivated_at', null)

  const eventLat = event?.latitude ? Number(event.latitude) : null
  const eventLng = event?.longitude ? Number(event.longitude) : null

  // Calculate distance and sort by closest
  const results: InvitableFriend[] = (profiles ?? []).map((p: any) => {
    let distance_miles: number | null = null
    if (eventLat && eventLng && p.latitude && p.longitude) {
      const R = 3959
      const dLat = ((Number(p.latitude) - eventLat) * Math.PI) / 180
      const dLon = ((Number(p.longitude) - eventLng) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((eventLat * Math.PI) / 180) * Math.cos((Number(p.latitude) * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
      distance_miles = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
    }
    return {
      id: p.id,
      username: p.username,
      first_name: p.first_name,
      last_name: p.last_name,
      profile_photo_url: p.profile_photo_url,
      phone_verified_at: p.phone_verified_at,
      distance_miles,
    }
  })

  results.sort((a, b) => {
    if (a.distance_miles === null && b.distance_miles === null) return 0
    if (a.distance_miles === null) return 1
    if (b.distance_miles === null) return -1
    return a.distance_miles - b.distance_miles
  })

  return results
}

// ─── Search ────────────────────────────────────────────────

export interface EventSearchFilters {
  type?: EventType
  category?: EventCategory
  date_from?: string
  date_to?: string
  search_term?: string
  group_id?: string
  sort?: 'soonest' | 'nearest' | 'most_popular'
}

export async function searchEvents(filters: EventSearchFilters): Promise<EventDetail[]> {
  const user = await requireAuth()
  const admin = getServiceClient()

  // Get user's group IDs for private group filtering
  const { data: memberships } = await admin
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
  const myGroupIds = new Set((memberships ?? []).map((m) => m.group_id))

  let query = admin
    .from('events')
    .select('*, creator:profiles!creator_id(id, username, first_name, last_name, profile_photo_url), group:groups!group_id(id, privacy)')
    .eq('status', 'published')

  if (filters.type) query = query.eq('type', filters.type)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.group_id) query = query.eq('group_id', filters.group_id)
  if (filters.date_from) query = query.gte('starts_at', filters.date_from)
  if (filters.date_to) query = query.lte('starts_at', filters.date_to)

  // Default: only future events
  if (!filters.date_from) {
    query = query.gte('starts_at', new Date().toISOString())
  }

  // Sort
  if (filters.sort === 'most_popular') {
    query = query.order('going_count', { ascending: false })
  } else {
    query = query.order('starts_at', { ascending: true })
  }

  const { data } = await query.limit(100)

  // Filter out private group events the user is not a member of
  let results = ((data ?? []) as any[]).filter((e) => {
    if (!e.group_id) return true
    if (e.group?.privacy !== 'private') return true
    return myGroupIds.has(e.group_id)
  }) as EventDetail[]
  if (filters.search_term) {
    const term = filters.search_term.toLowerCase()
    results = results.filter((e) =>
      e.title.toLowerCase().includes(term) ||
      e.description?.toLowerCase().includes(term) ||
      e.venue_name?.toLowerCase().includes(term) ||
      e.city?.toLowerCase().includes(term) ||
      e.state?.toLowerCase().includes(term)
    )
  }

  return results
}
