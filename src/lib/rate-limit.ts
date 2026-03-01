const store = new Map<string, { count: number; resetAt: number }>()

/**
 * Throws if the given key has exceeded max calls within windowMs.
 * Uses in-memory storage — resets on cold starts, but prevents burst attacks within a session.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return
  }

  if (entry.count >= max) {
    throw new Error('Too many requests. Please slow down.')
  }

  entry.count++
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

export function validateImageFile(file: File): void {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('File too large. Maximum size is 10 MB.')
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.')
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    throw new Error('Invalid file extension. Only .jpg, .jpeg, .png, and .webp are allowed.')
  }
}
