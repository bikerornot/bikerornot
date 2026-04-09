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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate that a string is a well-formed UUID before interpolating it into
 * a PostgREST .or() filter string. Any non-UUID input (commas, parens, .eq.
 * expressions) could otherwise subvert filter logic and bypass auth gates.
 */
export function assertUuid(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Inspect the first bytes of a buffer to confirm it's actually a JPEG, PNG,
 * or WebP. `file.type` and filename extension are both client-controlled and
 * trivially spoofed — the magic bytes aren't. Returns true only for real image
 * content matching one of our allowed formats.
 */
function hasValidImageMagicBytes(bytes: Uint8Array): boolean {
  // JPEG — FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true
  }
  // PNG — 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return true
  }
  // WebP — "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return true
  }
  return false
}

/**
 * Validate an uploaded image: size, MIME type, extension, and — most importantly
 * — magic bytes in the actual file content. Async because it peeks at the first
 * bytes of the file. Throws a user-facing error on any failure.
 */
export async function validateImageFile(file: File): Promise<void> {
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

  // Magic-byte check — catches spoofed MIME / extension. Read only the first
  // 12 bytes rather than the whole file.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!hasValidImageMagicBytes(head)) {
    throw new Error('File content does not match an allowed image type.')
  }
}
