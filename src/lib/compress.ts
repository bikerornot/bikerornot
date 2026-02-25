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
  return imageCompression(file, { maxSizeMB, maxWidthOrHeight, useWebWorker: true })
}
