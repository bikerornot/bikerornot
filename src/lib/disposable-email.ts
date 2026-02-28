import fs from 'fs'
import path from 'path'

// Cached Set — loaded once per process instance
let cache: Set<string> | null = null

function getDomains(): Set<string> {
  if (!cache) {
    const file = fs.readFileSync(
      path.join(process.cwd(), 'src', 'data', 'disposable-email-blocklist.txt'),
      'utf-8'
    )
    cache = new Set(
      file.split('\n').map((d) => d.trim().toLowerCase()).filter(Boolean)
    )
  }
  return cache
}

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return getDomains().has(domain)
}
