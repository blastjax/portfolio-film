import sharp from 'sharp';
import { getPhoto } from '../../../../../lib/photos';

// Resized thumbnail for gallery grids, generated on the fly from the stored master — public
export async function GET(request, { params }) {
  const { id } = await params;
  const photo = getPhoto(id);
  if (!photo) return new Response(null, { status: 404 });

  try {
    const thumb = await sharp(photo.image)
      .resize({ width: 720, height: 720, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    return new Response(thumb, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    return new Response(null, { status: 500 });
  }
}
