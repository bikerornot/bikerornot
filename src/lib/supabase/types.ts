export interface Profile {
  id: string
  username: string | null
  first_name: string
  last_name: string
  date_of_birth: string
  zip_code: string
  relationship_status: 'single' | 'in_a_relationship' | 'its_complicated' | null
  display_name: string | null
  bio: string | null
  location: string | null
  riding_style: string[] | null
  profile_photo_url: string | null
  cover_photo_url: string | null
  status: 'active' | 'suspended' | 'banned'
  role: 'user' | 'moderator' | 'admin'
  gender: 'male' | 'female' | null
  city: string | null
  state: string | null
  onboarding_complete: boolean
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
}

export interface UserBike {
  id: string
  user_id: string
  year: number | null
  make: string | null
  model: string | null
  created_at: string
}

export const RIDING_STYLES = [
  'Sport / Supersport',
  'Cruiser',
  'Touring',
  'Adventure / Dual-Sport',
  'Naked / Streetfighter',
  'Dirt / Motocross',
  'Scooter',
  'Cafe Racer',
  'Chopper / Custom',
  'Electric',
] as const

export interface PostImage {
  id: string
  post_id: string
  storage_path: string
  order_index: number
}

export interface Post {
  id: string
  author_id: string
  wall_owner_id: string | null
  content: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  author?: Profile
  images?: PostImage[]
  like_count?: number
  comment_count?: number
  is_liked_by_me?: boolean
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  content: string
  parent_comment_id: string | null
  created_at: string
  deleted_at: string | null
  author?: Profile
  like_count?: number
  is_liked_by_me?: boolean
}

export const GENDER_OPTIONS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
] as const

export const RELATIONSHIP_OPTIONS = [
  { value: 'single',            label: '🟢 Single' },
  { value: 'in_a_relationship', label: '💑 In a Relationship' },
  { value: 'its_complicated',   label: "🤷 It's Complicated" },
] as const
