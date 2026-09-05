import { NextResponse } from 'next/server';
import { listGalleryItems, insertPhoto, groupPhotos } from '../../../lib/photos';
import { stripMetadata } from '../../../lib/processImage';
import { validatePhotoDate } from '../../../lib/validation';
import { isAuthenticated } from '../../../lib/auth';

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024; // 40MB per file
const MAX_GROUP_FILES = 30; // cap on photos uploaded together as one group

// List gallery items (standalone photos + groups; metadata only, no image
// bytes) — public
export async function GET() {
  return NextResponse.json(listGalleryItems());
}

// Upload + process one or more photos — admin only. Uploading a single file
// adds a standalone photo; uploading several at once groups them together,
// with the first file becoming the group's cover.
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

  const files = formData.getAll('photo').filter((f) => typeof f !== 'string');
  if (files.length === 0) {
    return NextResponse.json({ error: 'No photo file received.' }, { status: 400 });
  }
  if (files.length > MAX_GROUP_FILES) {
    return NextResponse.json({ error: `Too many photos at once (max ${MAX_GROUP_FILES}).` }, { status: 400 });
  }
  for (const file of files) {
    if (!file.type || !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed.' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Photo is too large (max 40MB each).' }, { status: 400 });
    }
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
    const ids = [];
    for (const file of files) {
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
      ids.push(info.lastInsertRowid);
    }

    if (ids.length > 1) {
      const groupId = groupPhotos(ids, ids[0]);
      return NextResponse.json({ id: groupId, type: 'group', photoIds: ids }, { status: 201 });
    }

    return NextResponse.json({ id: ids[0], type: 'photo' }, { status: 201 });
  } catch (err) {
    console.error('Upload failed:', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}
