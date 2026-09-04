import { NextResponse } from 'next/server';
import { getPhoto, updatePhoto, deletePhoto } from '../../../../lib/photos';
import { validatePhotoDate } from '../../../../lib/validation';
import { isAuthenticated } from '../../../../lib/auth';

// Edit a photo's title/date — admin only
export async function PATCH(request, { params }) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const { id } = await params;
  const existing = getPhoto(id);
  if (!existing) return new NextResponse(null, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }

  const dateResult = validatePhotoDate(body.photo_date);
  if (!dateResult.ok) {
    return NextResponse.json({ error: dateResult.error }, { status: 400 });
  }

  updatePhoto(id, title, dateResult.value);
  return NextResponse.json({ ok: true });
}

// Delete a photo — admin only
export async function DELETE(request, { params }) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const { id } = await params;
  const info = deletePhoto(id);
  if (info.changes === 0) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
