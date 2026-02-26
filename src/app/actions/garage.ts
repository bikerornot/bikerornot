'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function addBike(year: number, make: string, model: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data, error } = await admin
    .from('user_bikes')
    .insert({ user_id: user.id, year, make, model })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function updateBike(id: string, year: number, make: string, model: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('user_bikes')
    .update({ year, make, model })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

export async function deleteBike(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('user_bikes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

export async function uploadBikePhoto(bikeId: string, formData: FormData): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${user.id}/${bikeId}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const admin = getServiceClient()
  const { error: uploadError } = await admin.storage
    .from('bikes')
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadError) throw new Error(uploadError.message)

  const { error: updateError } = await admin
    .from('user_bikes')
    .update({ photo_url: path })
    .eq('id', bikeId)
    .eq('user_id', user.id)
  if (updateError) throw new Error(updateError.message)

  return path
}
