import Link from 'next/link'
import VerifiedBadge from './VerifiedBadge'

interface Props {
  username: string | null
  displayName?: string | null
  href?: string
  verified?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_PRIMARY: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-base font-medium',
  md: 'text-lg font-bold sm:text-base',
  lg: 'text-2xl font-bold',
}
const SIZE_SECONDARY: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-sm',
}
const VERIFIED_SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

export default function UserIdentity({
  username,
  displayName,
  href,
  verified = false,
  size = 'md',
  className = '',
}: Props) {
  const handle = username ?? 'unknown'
  const trimmedDisplay = displayName?.trim() ?? ''
  // Treat display_name as unset when it equals the username — onboarding seeds
  // display_name to the username by default, and rendering "Christy / @Christy"
  // is just the same word twice. Only show the two-line form when the user has
  // a real distinct display name.
  const hasDisplayName =
    trimmedDisplay.length > 0 &&
    trimmedDisplay.toLowerCase() !== handle.toLowerCase()

  const primary = hasDisplayName ? (
    <span className={`${SIZE_PRIMARY[size]} text-white inline-flex items-center gap-1`}>
      <span className="truncate">{displayName}</span>
      {verified && <VerifiedBadge className={`${VERIFIED_SIZE[size]} flex-shrink-0`} />}
    </span>
  ) : (
    <span className={`${SIZE_PRIMARY[size]} text-white inline-flex items-center gap-1`}>
      <span className="truncate">
        <span className="opacity-50">@</span>
        {handle}
      </span>
      {verified && <VerifiedBadge className={`${VERIFIED_SIZE[size]} flex-shrink-0`} />}
    </span>
  )

  const secondary = hasDisplayName ? (
    <span className={`${SIZE_SECONDARY[size]} text-zinc-400`}>@{handle}</span>
  ) : null

  const content = (
    <span className={`flex flex-col min-w-0 ${className}`}>
      {primary}
      {secondary}
    </span>
  )

  if (href) {
    return (
      <Link href={href} className="hover:underline min-w-0">
        {content}
      </Link>
    )
  }
  return content
}
