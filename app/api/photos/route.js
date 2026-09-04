import { NextResponse } from 'next/server';
import { listPhotos, insertPhoto } from '../../../lib/photos';
import { stripMetadata } from '../../../lib/processImage';
import { validatePhotoDate } from '../../../lib/validation';
import { isAuthenticated } from '../../../lib/auth';

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // 40MB

// List all photos (metadata only, no image bytes) — public
export async function GET() {
  return NextResponse.json(listPhotos());
}

// Upload + process a new photo — admin only
export async function POST(request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });
  }

  const file = formData.get('photo');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No photo file received.' }, { status: 400 });
  }
  if (!file.type || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Photo is too large (max 40MB).' }, { status: 400 });
  }

  const title = String(formData.get('title') || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }

  const dateResult = validatePhotoDate(formData.get('photo_date'));
  if (!dateResult.ok) {
    return NextResponse.json({ error: dateResult.error }, { status: 400 });
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer, width, height, mimeType } = await stripMetadata(inputBuffer);

    const info = insertPhoto({
      title,
      photo_date: dateResult.value,
      mime_type: mimeType,
      width,
      height,
      image: buffer,
    });

    return NextResponse.json({ id: info.lastInsertRowid }, { status: 201 });
  } catch (err) {
    console.error('Upload failed:', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
