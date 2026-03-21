import Link from 'next/link'

const URL_PATTERN = /^https?:\/\/[^\s]+$/
const MENTION_PATTERN = /^@([a-zA-Z0-9_]+)$/
// Combined: split on URLs and mentions, preserving delimiters
const CONTENT_REGEX = /(https?:\/\/[^\s]+|@[a-zA-Z0-9_]+)/g

export function renderContent(text: string, excludeUrl?: string) {
  const parts = text.split(CONTENT_REGEX)
  return parts.map((part, i) => {
    if (!part) return null

    // URL match
    if (URL_PATTERN.test(part)) {
      if (excludeUrl && part === excludeUrl) return null
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange-400 hover:text-orange-300 underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      )
    }

    // @mention match
    const mentionMatch = part.match(MENTION_PATTERN)
    if (mentionMatch) {
      const username = mentionMatch[1]
      return (
        <Link
          key={i}
          href={`/profile/${username}`}
          className="text-orange-400 hover:text-orange-300 font-semibold"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </Link>
      )
    }

    // Plain text
    return part
  })
}
