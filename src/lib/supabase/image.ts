interface ImageOptions {
  width?: number
  height?: number
  quality?: number
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * Returns a Supabase Storage URL for the given bucket and path.
 *
 * With options: returns an image transformation URL (requires Supabase Pro).
 * Without options: returns the plain public URL (works on free tier).
 *
 * Store only the storage path in the DB (e.g. "userId/avatar.jpg"),
 * never the full URL.
 */
export function getImageUrl(
  bucket: string,
  path: string,
  options?: ImageOptions,
  version?: string
): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  if (!options || Object.keys(options).length === 0) {
    const base = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
    return version ? `${base}?v=${encodeURIComponent(version)}` : base
  }

  const params = new URLSearchParams()
  if (options.width)   params.set('width',   String(options.width))
  if (options.height)  params.set('height',  String(options.height))
  if (options.quality) params.set('quality', String(options.quality))
  if (options.resize)  params.set('resize',  options.resize)
  if (version)         params.set('v',       version)

  return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${path}?${params.toString()}`
}
