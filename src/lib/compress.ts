import imageCompression from 'browser-image-compression'

/**
 * Compresses an image client-side before upload.
 * Skips files already under the target size.
 */
export async function compressImage(
  file: File,
  maxSizeMB = 1,
  maxWidthOrHeight = 1920
): Promise<File> {
  if (file.size <= maxSizeMB * 1024 * 1024) return file
  const blob = await imageCompression(file, { maxSizeMB, maxWidthOrHeight, useWebWorker: true })
  // browser-image-compression returns a Blob with .name set as a plain property,
  // which FormData ignores (it defaults to the filename "blob"). Wrapping in a
  // real File preserves the original filename so server-side validation passes.
  return new File([blob], file.name, { type: blob.type || file.type })
}
