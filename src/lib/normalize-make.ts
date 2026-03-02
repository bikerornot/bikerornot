// Canonical make names — used at every bike write path to keep the DB clean.
// Keys are lowercase; values are the canonical display form.
export const MAKE_CANONICAL: Record<string, string> = {
  'harley-davidson':   'Harley-Davidson',
  'harley davidson':   'Harley-Davidson',
  'harley':            'Harley-Davidson',
  'hd':                'Harley-Davidson',
  'h-d':               'Harley-Davidson',
  'h.d.':              'Harley-Davidson',
  'indian motorcycle': 'Indian',
  'indian motocycle':  'Indian',
  'bmw motorrad':      'BMW',
  'moto-guzzi':        'Moto Guzzi',
}

export function normalizeMake(make: string): string {
  return MAKE_CANONICAL[make.trim().toLowerCase()] ?? make.trim()
}
