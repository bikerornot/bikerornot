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
  role: 'user' | 'moderator' | 'admin' | 'super_admin'
  gender: 'male' | 'female' | null
  city: string | null
  state: string | null
  onboarding_complete: boolean
  latitude: number | null
  longitude: number | null
  signup_ip: string | null
  signup_country: string | null
  signup_region: string | null
  suspension_reason: string | null
  suspended_until: string | null
  ban_reason: string | null
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
  group_id?: string | null
  shared_post_id?: string | null
  content: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  author?: Profile
  images?: PostImage[]
  like_count?: number
  comment_count?: number
  is_liked_by_me?: boolean
  shared_post?: Omit<Post, 'shared_post'> | null
}

export interface Group {
  id: string
  name: string
  slug: string
  description: string | null
  cover_photo_url: string | null
  privacy: 'public' | 'private'
  creator_id: string
  created_at: string
  updated_at: string
  member_count?: number
  is_member?: boolean
  member_role?: 'admin' | 'member' | null
  member_status?: 'active' | 'pending' | null
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: 'admin' | 'member'
  status: 'active' | 'pending'
  joined_at: string
  profile?: Profile
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

export interface Notification {
  id: string
  user_id: string
  type: 'friend_request' | 'friend_accepted' | 'post_like' | 'post_comment' | 'comment_reply' | 'comment_like' | 'group_invite' | 'wall_post'
  actor_id: string
  post_id: string | null
  comment_id: string | null
  group_id: string | null
  read_at: string | null
  created_at: string
  actor?: Profile
  group?: { id: string; name: string; slug: string } | null
}

export interface Conversation {
  id: string
  participant1_id: string
  participant2_id: string
  last_message_at: string
  last_message_preview: string | null
  created_at: string
  participant1?: Profile
  participant2?: Profile
}

export interface ConversationSummary {
  id: string
  other_user: Profile
  last_message_preview: string | null
  last_message_at: string
  unread_count: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  read_at: string | null
  created_at: string
  sender?: Profile
}

export interface Report {
  id: string
  reporter_id: string
  reported_type: 'post' | 'comment' | 'profile'
  reported_id: string
  reason: string
  details: string | null
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed'
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  reporter?: Profile
}

export const REPORT_REASONS = [
  { value: 'spam',         label: 'Spam' },
  { value: 'harassment',  label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'nudity',      label: 'Nudity or sexual content' },
  { value: 'violence',    label: 'Violence' },
  { value: 'fake_account',label: 'Fake account / impersonation' },
  { value: 'other',       label: 'Other' },
] as const

export const GENDER_OPTIONS = [
  { value: 'male',   label: 'Male' },
  { value: 'female', label: 'Female' },
] as const

export const RELATIONSHIP_OPTIONS = [
  { value: 'single',            label: '🟢 Single' },
  { value: 'in_a_relationship', label: '💑 In a Relationship' },
  { value: 'its_complicated',   label: "🤷 It's Complicated" },
] as const
