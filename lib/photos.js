import { getDb } from './db';

// Prepared statements are created lazily, on first actual use, for the same
// reason `getDb()` is lazy — see the comment in db.js.
let statements;
function getStatements() {
  if (statements) return statements;
  const db = getDb();
  statements = {
    insert: db.prepare(`
      INSERT INTO photos (title, photo_date, mime_type, width, height, image, group_id)
      VALUES ($title, $photo_date, $mime_type, $width, $height, $image, $group_id)
    `),
    // Joins each photo to its group (if any) and to that group's cover photo,
    // so the gallery can be sorted by "effective" date (the cover's date for
    // grouped photos) and rows for the same group land next to each other.
    listGallery: db.prepare(`
      SELECT
        p.id, p.title, p.photo_date, p.uploaded_at, p.mime_type, p.width, p.height, p.group_id,
        g.cover_photo_id
      FROM photos p
      LEFT JOIN groups g ON g.id = p.group_id
      LEFT JOIN photos cover ON cover.id = g.cover_photo_id
      ORDER BY COALESCE(cover.photo_date, p.photo_date) DESC, p.group_id DESC, p.id DESC
    `),
    get: db.prepare(`SELECT * FROM photos WHERE id = ?`),
    update: db.prepare(`UPDATE photos SET title = $title, photo_date = $photo_date WHERE id = $id`),
    del: db.prepare(`DELETE FROM photos WHERE id = ?`),
    setPhotoGroup: db.prepare(`UPDATE photos SET group_id = ? WHERE id = ?`),
    countInGroup: db.prepare(`SELECT COUNT(*) AS n FROM photos WHERE group_id = ?`),
    latestInGroup: db.prepare(`SELECT id FROM photos WHERE group_id = ? ORDER BY id DESC LIMIT 1`),
    insertGroup: db.prepare(`INSERT INTO groups (cover_photo_id) VALUES (?)`),
    getGroup: db.prepare(`SELECT * FROM groups WHERE id = ?`),
    setCover: db.prepare(`UPDATE groups SET cover_photo_id = ? WHERE id = ?`),
    delGroup: db.prepare(`DELETE FROM groups WHERE id = ?`),
  };
  return statements;
}

export const getPhoto = (id) => getStatements().get.get(id);
export const updatePhoto = (id, title, photoDate) => getStatements().update.run({ id, title, photo_date: photoDate });
export const getGroup = (id) => getStatements().getGroup.get(id);

export const insertPhoto = (photo) => getStatements().insert.run({ group_id: null, ...photo });

// Creates a group out of already-inserted photos and points their group_id
// at it. Used right after a multi-file upload, once the individual photo
// rows (and thus their ids) exist.
export function groupPhotos(photoIds, coverPhotoId) {
  const s = getStatements();
  const info = s.insertGroup.run(coverPhotoId);
  const groupId = info.lastInsertRowid;
  for (const id of photoIds) s.setPhotoGroup.run(groupId, id);
  return groupId;
}

export function setGroupCover(groupId, photoId) {
  getStatements().setCover.run(photoId, groupId);
}

// Gallery listing as a flat list of items: standalone photos and photo
// groups (each carrying its full list of member photos plus which one is
// the cover), interleaved and sorted by date.
export function listGalleryItems() {
  const rows = getStatements().listGallery.all();

  const items = [];
  const groupsById = new Map();
  for (const row of rows) {
    const photo = {
      id: row.id,
      title: row.title,
      photo_date: row.photo_date,
      mime_type: row.mime_type,
      width: row.width,
      height: row.height,
    };

    if (row.group_id == null) {
      items.push({ type: 'photo', ...photo });
      continue;
    }

    let group = groupsById.get(row.group_id);
    if (!group) {
      group = { type: 'group', id: row.group_id, cover_photo_id: row.cover_photo_id, photos: [] };
      groupsById.set(row.group_id, group);
      items.push(group);
    }
    group.photos.push(photo);
  }
  return items;
}

// Deletes a photo, then keeps its group consistent: if it was the group's
// last photo the (now-empty) group is removed too, and if it was the
// group's cover another member takes over as cover.
export function deletePhotoCascade(id) {
  const s = getStatements();
  const photo = s.get.get(id);
  if (!photo) return { changes: 0 };

  const info = s.del.run(id);

  if (photo.group_id != null) {
    const { n } = s.countInGroup.get(photo.group_id);
    if (n === 0) {
      s.delGroup.run(photo.group_id);
    } else {
      const group = s.getGroup.get(photo.group_id);
      if (group && group.cover_photo_id === photo.id) {
        const next = s.latestInGroup.get(photo.group_id);
        if (next) s.setCover.run(next.id, photo.group_id);
      }
    }
  }

  return info;
}
