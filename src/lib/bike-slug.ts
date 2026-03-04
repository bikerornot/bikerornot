/**
 * Generates a URL-safe slug from bike year/make/model.
 * e.g. (2019, "Harley-Davidson", "Road Glide") → "2019-harley-davidson-road-glide"
 */
export function bikeSluggify(year: number | string, make: string, model: string): string {
  return [String(year), make, model]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
