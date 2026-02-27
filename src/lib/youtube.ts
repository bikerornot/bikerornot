export function extractYouTubeId(text: string): { id: string; fullUrl: string } | null {
  const patterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})[^\s]*/i,
    /https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})[^\s]*/i,
    /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})[^\s]*/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return { id: match[1], fullUrl: match[0] }
  }
  return null
}

export async function fetchYouTubeMeta(videoId: string): Promise<{ title: string; channel: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    return { title: data.title ?? '', channel: data.author_name ?? '' }
  } catch {
    return null
  }
}
