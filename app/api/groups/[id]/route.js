import { NextResponse } from 'next/server';
import { getGroup, getPhoto, setGroupCover } from '../../../../lib/photos';
import { isAuthenticated } from '../../../../lib/auth';

// Change which photo in a group is used as its gallery cover — admin only
export async function PATCH(request, { params }) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const { id } = await params;
  const group = getGroup(id);
  if (!group) return new NextResponse(null, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const photoId = Number(body.cover_photo_id);
  if (!photoId) {
    return NextResponse.json({ error: 'cover_photo_id is required.' }, { status: 400 });
  }

  const photo = getPhoto(photoId);
  if (!photo || photo.group_id !== group.id) {
    return NextResponse.json({ error: 'That photo is not part of this group.' }, { status: 400 });
  }

  setGroupCover(group.id, photoId);
  return NextResponse.json({ ok: true });
}
