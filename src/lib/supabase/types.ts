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
  country: string
  onboarding_complete: boolean
  latitude: number | null
  longitude: number | null
  signup_ip: string | null
  signup_country: string | null
  signup_region: string | null
  signup_city: string | null
  suspension_reason: string | null
  suspended_until: string | null
  ban_reason: string | null
  created_at: string
  updated_at: string
  last_seen_at?: string | null
  deactivated_at?: string | null
  deletion_scheduled_at?: string | null
  email_friend_requests: boolean
  email_friend_accepted: boolean
  email_mentions: boolean
  email_wall_posts: boolean
  email_comments: boolean
  show_real_name: boolean
  show_birthday: boolean
  show_online_status: boolean
  email_weekly_digest: boolean
  phone_number: string | null
  phone_verified_at: string | null
  phone_verification_required: boolean
}

export interface UserBike {
  id: string
  user_id: string
  year: number | null
  make: string | null
  model: string | null
  description: string | null
  photo_url: string | null
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

export interface BikePhoto {
  id: string
  bike_id: string
  user_id: string
  storage_path: string
  is_primary: boolean
  created_at: string
}

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
  bike_id?: string | null
  group_id?: string | null
  shared_post_id?: string | null
  event_id?: string | null
  content: string | null
  post_type?: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  edited_at?: string | null
  author?: Profile
  images?: PostImage[]
  like_count?: number
  comment_count?: number
  is_liked_by_me?: boolean
  shared_post?: Omit<Post, 'shared_post'> | null
  group?: { name: string; slug: string } | null
  event?: { id: string; type: string; title: string; slug: string; starts_at: string; city: string | null; state: string | null; going_count: number; cover_photo_url: string | null; status: string } | null
}

export const GROUP_CATEGORIES = [
  { value: 'brand',           label: 'Bike Brands' },
  { value: 'local',           label: 'Local Riding Groups' },
  { value: 'events',          label: 'Events & Rallies' },
  { value: 'mechanical',      label: 'Mechanical / DIY' },
  { value: 'women_riders',    label: 'Women Riders' },
  { value: 'veterans',        label: 'Veterans / Military' },
  { value: 'clubs',           label: 'Riding Clubs' },
  { value: 'touring_travel',  label: 'Touring & Travel' },
  { value: 'social',          label: 'Community & Connection' },
] as const

export type GroupCategory = typeof GROUP_CATEGORIES[number]['value']

export const US_STATES = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' }, { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' }, { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' }, { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' }, { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' }, { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' }, { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' }, { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' }, { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' }, { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' }, { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' }, { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' }, { abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' }, { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' }, { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' }, { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' }, { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' }, { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' }, { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' }, { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' }, { abbr: 'WY', name: 'Wyoming' },
] as const

export interface Group {
  id: string
  name: string
  slug: string
  description: string | null
  cover_photo_url: string | null
  privacy: 'public' | 'private'
  creator_id: string
  status: 'active' | 'suspended'
  suspended_reason: string | null
  category: GroupCategory | null
  city: string | null
  state: string | null
  zip_code: string | null
  latitude: number | null
  longitude: number | null
  last_post_at: string | null
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
  hidden_at?: string | null
  author?: Profile
  like_count?: number
  is_liked_by_me?: boolean
}

export interface Notification {
  id: string
  user_id: string
  type: 'friend_request' | 'friend_accepted' | 'post_like' | 'post_comment' | 'comment_reply' | 'comment_like' | 'group_invite' | 'wall_post' | 'dmca_takedown' | 'mention' | 'event_invite' | 'event_rsvp' | 'event_reminder' | 'event_cancelled' | 'event_update'
  actor_id: string
  post_id: string | null
  comment_id: string | null
  group_id: string | null
  event_id: string | null
  content_url: string | null
  read_at: string | null
  created_at: string
  actor?: Profile
  group?: { id: string; name: string; slug: string } | null
  event?: { id: string; title: string; slug: string } | null
}

export interface DmcaCounterNotice {
  id: string
  original_notice_id: string | null
  user_id: string | null
  full_name: string
  email: string
  address: string
  phone: string | null
  removed_content_description: string
  original_url: string
  good_faith_statement: boolean
  jurisdiction_consent: boolean
  electronic_signature: string
  status: 'received' | 'forwarded' | 'restored' | 'dismissed'
  notes: string | null
  created_at: string
  reviewed_at: string | null
  profile?: Profile | null
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
  { value: 'married',            label: '💍 Married' },
  { value: 'its_complicated',   label: "🤷 It's Complicated" },
] as const

// =============================================================
// CLASSIFIEDS
// =============================================================

export type ListingStatus = 'draft' | 'active' | 'inactive' | 'sold' | 'expired' | 'removed'

export type ListingCategory =
  | 'cruiser'
  | 'touring_bagger'
  | 'trike'
  | 'sport_naked'
  | 'dirt_offroad'
  | 'dual_sport_adventure'
  | 'custom_chopper'
  | 'vintage_classic'
  | 'scooter_moped'
  | 'other'

export type ListingCondition = 'excellent' | 'good' | 'fair' | 'project'
export type PriceType = 'fixed' | 'obo'

export const LISTING_CATEGORIES: Record<ListingCategory, string> = {
  cruiser:                'Cruiser',
  touring_bagger:         'Touring / Bagger',
  trike:                  'Trike / Three-Wheeler',
  sport_naked:            'Sport / Naked',
  dirt_offroad:           'Dirt / Off-Road',
  dual_sport_adventure:   'Dual-Sport / Adventure',
  custom_chopper:         'Custom / Chopper',
  vintage_classic:        'Vintage / Classic',
  scooter_moped:          'Scooter / Moped',
  other:                  'Other',
}

export const LISTING_CONDITIONS: Record<ListingCondition, { label: string; description: string }> = {
  excellent: { label: 'Excellent',    description: 'Like new. No mechanical issues, minimal cosmetic wear.' },
  good:      { label: 'Good',         description: 'Well maintained. Minor cosmetic wear, fully functional.' },
  fair:      { label: 'Fair',         description: 'Rideable with some wear or minor issues needing attention.' },
  project:   { label: 'Project Bike', description: 'Needs work. Good for restoration or parts.' },
}

export const MAX_LISTING_IMAGES = 24
export const MAX_LISTINGS_PER_USER = 3
export const LISTING_DURATION_DAYS = 90

export interface Listing {
  id: string
  seller_id: string
  user_bike_id: string | null
  status: ListingStatus
  category: ListingCategory
  year: number
  make: string
  model: string
  trim: string | null
  color: string | null
  vin: string | null
  mileage: number | null
  condition: ListingCondition
  modifications: string | null
  title: string
  description: string | null
  price: number | null
  price_type: PriceType
  trade_considered: boolean
  zip_code: string
  city: string | null
  state: string | null
  latitude: number | null
  longitude: number | null
  show_phone: boolean
  view_count: number
  save_count: number
  published_at: string | null
  expires_at: string | null
  sold_at: string | null
  created_at: string
  updated_at: string
}

export interface ListingImage {
  id: string
  listing_id: string
  storage_path: string
  order_index: number
  created_at: string
}

export interface ListingSearchResult {
  id: string
  seller_id: string
  seller_username: string
  seller_photo: string | null
  seller_verified: boolean
  seller_member_since: string
  category: ListingCategory
  year: number
  make: string
  model: string
  trim: string | null
  color: string | null
  mileage: number | null
  condition: ListingCondition
  title: string
  price: number | null
  price_type: PriceType
  trade_considered: boolean
  city: string | null
  state: string | null
  distance_miles: number | null
  cover_image_path: string | null
  view_count: number
  save_count: number
  is_saved: boolean
  published_at: string | null
  expires_at: string | null
  created_at: string
}

export type BannerAudience = 'all' | 'unverified' | 'verified'

export interface SiteBanner {
  id: string
  text: string
  link_url: string | null
  link_text: string | null
  bg_color: string
  active: boolean
  priority: number
  dismissible: boolean
  audience: BannerAudience
  starts_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface ListingDetail extends Listing {
  seller_username: string
  seller_first_name: string
  seller_last_name: string
  seller_photo: string | null
  seller_verified: boolean
  seller_member_since: string
  seller_listings_sold: number
  is_saved: boolean
  is_own_listing: boolean
  mutual_friend_count: number
  images: ListingImage[]
  seller_phone: string | null
}

export interface MyListing extends Listing {
  images: ListingImage[]
  message_count: number
}

export interface ClassifiedsSearchFilters {
  category?: ListingCategory
  make?: string
  model?: string
  year_min?: number
  year_max?: number
  price_min?: number
  price_max?: number
  mileage_max?: number
  condition?: ListingCondition[]
  trade_only?: boolean
  radius_miles?: number
  search_term?: string
  sort: 'newest' | 'price_asc' | 'price_desc' | 'mileage_asc' | 'nearest'
}
