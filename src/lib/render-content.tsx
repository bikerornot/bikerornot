import Link from 'next/link'

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g
// Combined: split on URLs and mentions, preserving delimiters
const CONTENT_REGEX = /(https?:\/\/[^\s]+|@[a-zA-Z0-9_]+)/g

export function renderContent(text: string, excludeUrl?: string) {
  const parts = text.split(CONTENT_REGEX)
  return parts.map((part, i) => {
    if (!part) return null

    // URL match
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0
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
    if (MENTION_REGEX.test(part)) {
      MENTION_REGEX.lastIndex = 0
      const username = part.slice(1) // remove @
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
