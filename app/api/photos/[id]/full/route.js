import { getPhoto } from '../../../../../lib/photos';

// Full-resolution image (as stored: metadata stripped) — public
export async function GET(request, { params }) {
  const { id } = await params;
  const photo = getPhoto(id);
  if (!photo) return new Response(null, { status: 404 });

  return new Response(Buffer.from(photo.image), {
    headers: {
      'Content-Type': photo.mime_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
