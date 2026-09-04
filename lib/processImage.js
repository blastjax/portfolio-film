import sharp from 'sharp';

/**
 * Process an uploaded image buffer:
 *  - auto-orients using the original EXIF orientation flag, baking it into
 *    the pixel data before that flag (and everything else) is discarded
 *  - re-encodes it as JPEG, which drops EXIF/GPS/IPTC/XMP/ICC metadata,
 *    since sharp only keeps metadata when .withMetadata() is explicitly
 *    called
 *
 * Returns { buffer, width, height, mimeType }.
 */
export async function stripMetadata(inputBuffer) {
  const oriented = sharp(inputBuffer).rotate();
  const meta = await oriented.metadata();

  const buffer = await oriented.jpeg({ quality: 92, mozjpeg: true }).toBuffer();

  return { buffer, width: meta.width, height: meta.height, mimeType: 'image/jpeg' };
}
