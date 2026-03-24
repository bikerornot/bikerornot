import type { ListingCategory } from '@/lib/supabase/types'

// Auto-detect listing category from make + model
// Falls back to 'other' if no match

const TRIKE_MODELS = [
  'tri glide', 'freewheeler', 'spyder', 'ryker', 'slingshot',
  'goldwing trike', 'gold wing trike', 'voyager trike',
]

const TOURING_MODELS = [
  'road glide', 'street glide', 'electra glide', 'ultra limited', 'ultra classic',
  'road king', 'cvo', 'gold wing', 'goldwing', 'venture', 'vaquero',
  'indian pursuit', 'indian challenger', 'chieftain', 'roadmaster',
  'star venture', 'nomad', 'voyager', 'valkyrie', 'concours',
  'fjr1300', 'fjr 1300', 'r 1250 rt', 'r1250rt', 'k 1600', 'k1600',
  'multistrada', 'pan america',
]

const CRUISER_MODELS = [
  'sportster', 'iron 883', 'iron 1200', 'forty-eight', 'nightster', 'breakout',
  'fat boy', 'fat bob', 'softail', 'heritage', 'slim', 'low rider', 'deluxe',
  'dyna', 'wide glide', 'street bob', 'night rod',
  'scout', 'chief', 'indian dark horse', 'springfield', 'super chief',
  'vulcan', 'mean streak', 'boulevard', 'intruder', 'marauder',
  'shadow', 'rebel', 'fury', 'stateline', 'sabre', 'phantom', 'aero',
  'v-star', 'vstar', 'bolt', 'stryker', 'raider',
  'thunderbird', 'speedmaster', 'bonneville', 'america',
  'victory', 'vegas', 'kingpin', 'hammer', 'gunner', 'highball', 'octane',
  'diavel',
]

const SPORT_MODELS = [
  'cbr', 'ninja', 'zx-', 'zx6', 'zx10', 'zx14', 'yzf-r', 'yzf r', 'r1', 'r6', 'r7', 'r3',
  'gsx-r', 'gsxr', 'hayabusa', 'busa',
  'panigale', 'supersport', 'streetfighter', '959', '1299',
  'daytona', 'speed triple', 'street triple', 'rs 660', 'tuono',
  'rc 390', 'rc 8', 's1000rr', 's 1000 rr', 'mt-', 'mt09', 'mt07', 'mt10',
  'z900', 'z650', 'z400', 'z h2', 'fz', 'xsr',
  'duke', 'superduke', 'super duke',
  'monster', 'hypermotard',
  'cb650r', 'cb1000r', 'cb300r',
]

const DIRT_MODELS = [
  'crf', 'kx', 'yz', 'rm', 'rmz', 'rm-z', 'ktm sx', 'ktm xc',
  'exc', 'tc', 'fc', 'fe', 'te', 'tx',
  'beta', 'sherco', 'gas gas',
  'klx', 'drz', 'dr-z', 'ttr', 'tt-r', 'pw',
]

const ADVENTURE_MODELS = [
  'africa twin', 'v-strom', 'vstrom', 'versys', 'tiger',
  'adventure', 'gs', 'r 1250 gs', 'r1250gs', 'r 1200 gs', 'f 850 gs', 'f850gs',
  'tenere', 'ténéré', 'tracer', 'super tenere',
  'multistrada', 'desertx', 'desert x', 'norden',
  '890 adventure', '790 adventure', '1290 adventure',
  'himalayan', 'transalp', 'nc750x',
]

const CUSTOM_MODELS = [
  'chopper', 'bobber', 'custom',
]

const VINTAGE_MAKES = [
  'bsa', 'norton', 'vincent', 'matchless', 'ariel', 'velocette',
]

const SCOOTER_MODELS = [
  'vespa', 'scooter', 'pcx', 'forza', 'burgman', 'tmax', 'xmax',
  'nmax', 'metropolitan', 'ruckus', 'zuma', 'scoopy',
  'c650', 'c 650', 'c400', 'c 400',
]

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase()
  return patterns.some(p => lower.includes(p))
}

export function detectBikeCategory(make: string, model: string, year?: number): ListingCategory {
  const combined = `${make} ${model}`

  // Check trikes first (most specific)
  if (matchesAny(combined, TRIKE_MODELS)) return 'trike'
  if (make.toLowerCase().includes('can-am') || make.toLowerCase().includes('canam')) return 'trike'
  if (make.toLowerCase().includes('polaris') && model.toLowerCase().includes('slingshot')) return 'trike'

  // Scooters
  if (matchesAny(combined, SCOOTER_MODELS)) return 'scooter_moped'
  if (make.toLowerCase() === 'vespa' || make.toLowerCase() === 'piaggio') return 'scooter_moped'
  if (make.toLowerCase() === 'kymco' || make.toLowerCase() === 'sym') return 'scooter_moped'

  // Vintage (by make or year)
  if (matchesAny(make, VINTAGE_MAKES)) return 'vintage_classic'
  if (year && year < 1980) return 'vintage_classic'

  // Custom/chopper
  if (matchesAny(combined, CUSTOM_MODELS)) return 'custom_chopper'

  // Dirt/off-road (check before adventure since some overlap)
  if (matchesAny(combined, DIRT_MODELS)) return 'dirt_offroad'

  // Adventure/dual-sport
  if (matchesAny(combined, ADVENTURE_MODELS)) return 'dual_sport_adventure'

  // Sport/naked
  if (matchesAny(combined, SPORT_MODELS)) return 'sport_naked'

  // Touring (check before cruiser since some Harleys overlap)
  if (matchesAny(combined, TOURING_MODELS)) return 'touring_bagger'

  // Cruisers
  if (matchesAny(combined, CRUISER_MODELS)) return 'cruiser'

  // Make-level defaults for common cruiser brands
  const lowerMake = make.toLowerCase()
  if (lowerMake.includes('harley')) return 'cruiser'
  if (lowerMake === 'indian') return 'cruiser'
  if (lowerMake === 'victory') return 'cruiser'

  // Zero = electric, categorize as sport/naked (most Zeros are naked-style)
  if (lowerMake === 'zero') return 'sport_naked'

  return 'other'
}
