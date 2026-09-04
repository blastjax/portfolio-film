import { getDb } from './db';

// Prepared statements are created lazily, on first actual use, for the same
// reason `getDb()` is lazy — see the comment in db.js.
let statements;
function getStatements() {
  if (statements) return statements;
  const db = getDb();
  statements = {
    insert: db.prepare(`
      INSERT INTO photos (title, photo_date, mime_type, width, height, image)
      VALUES ($title, $photo_date, $mime_type, $width, $height, $image)
    `),
    list: db.prepare(`
      SELECT id, title, photo_date, uploaded_at, mime_type, width, height
      FROM photos ORDER BY photo_date DESC, id DESC
    `),
    get: db.prepare(`SELECT * FROM photos WHERE id = ?`),
    update: db.prepare(`UPDATE photos SET title = $title, photo_date = $photo_date WHERE id = $id`),
    del: db.prepare(`DELETE FROM photos WHERE id = ?`),
  };
  return statements;
}

export const listPhotos = () => getStatements().list.all();
export const getPhoto = (id) => getStatements().get.get(id);
export const insertPhoto = (photo) => getStatements().insert.run(photo);
export const updatePhoto = (id, title, photoDate) => getStatements().update.run({ id, title, photo_date: photoDate });
export const deletePhoto = (id) => getStatements().del.run(id);
