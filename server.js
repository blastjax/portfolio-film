const path = require('path');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');

const db = require('./db');
const { stripMetadata } = require('./processImage');
const {
  COOKIE_NAME,
  verifyPassword,
  createSession,
  destroySession,
  isValidSession,
  attachCookies,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  isLockedOut,
  recordFailedAttempt,
  clearAttempts,
} = require('./auth');

// 'YYYY' or 'YYYY-MM' (a plain 4-digit year, optionally a hyphenated month 01-12)
const DATE_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

function validatePhotoDate(raw) {
  const value = (raw || '').trim();
  if (!value) return { ok: true, value: null };
  if (!DATE_PATTERN.test(value)) {
    return { ok: false, error: 'Date must be a year (e.g. 2024) or year-month (e.g. 2024-07).' };
  }
  return { ok: true, value };
}

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB per photo
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use(attachCookies);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Prepared statements ----------------------------------------------
const stmtInsert = db.prepare(`
  INSERT INTO photos (title, photo_date, mime_type, width, height, image)
  VALUES ($title, $photo_date, $mime_type, $width, $height, $image)
`);
const stmtList = db.prepare(`
  SELECT id, title, photo_date, uploaded_at, mime_type, width, height
  FROM photos ORDER BY photo_date DESC, id DESC
`);
const stmtGet = db.prepare(`SELECT * FROM photos WHERE id = ?`);
const stmtUpdate = db.prepare(`UPDATE photos SET title = $title, photo_date = $photo_date WHERE id = $id`);
const stmtDelete = db.prepare(`DELETE FROM photos WHERE id = ?`);

// ---- Auth -----------------------------------------------------------------

// Deliberately not linked from anywhere in the UI.
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/api/auth/status', (req, res) => {
  res.json({ loggedIn: isValidSession(req.cookies[COOKIE_NAME]) });
});

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }

  const { password } = req.body || {};
  if (!verifyPassword(password)) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  clearAttempts(ip);
  const token = createSession();
  setSessionCookie(req, res, token);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  destroySession(req.cookies[COOKIE_NAME]);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- Photos API -----------------------------------------------------------

// List all photos (metadata only, no image bytes) — public
app.get('/api/photos', (req, res) => {
  res.json(stmtList.all());
});

// Upload + process a new photo — admin only
app.post('/api/photos', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo file received.' });

    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required.' });

    const dateResult = validatePhotoDate(req.body.photo_date);
    if (!dateResult.ok) return res.status(400).json({ error: dateResult.error });

    const { buffer, width, height, mimeType } = await stripMetadata(req.file.buffer);

    const info = stmtInsert.run({
      title,
      photo_date: dateResult.value,
      mime_type: mimeType,
      width,
      height,
      image: buffer,
    });

    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// Edit a photo's title/date — admin only
app.patch('/api/photos/:id', requireAuth, (req, res) => {
  const existing = stmtGet.get(req.params.id);
  if (!existing) return res.sendStatus(404);

  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required.' });

  const dateResult = validatePhotoDate(req.body.photo_date);
  if (!dateResult.ok) return res.status(400).json({ error: dateResult.error });

  stmtUpdate.run({ id: req.params.id, title, photo_date: dateResult.value });
  res.json({ ok: true });
});

// Full-resolution image (as stored: metadata stripped) — public
app.get('/api/photos/:id/full', (req, res) => {
  const photo = stmtGet.get(req.params.id);
  if (!photo) return res.sendStatus(404);
  res.set('Content-Type', photo.mime_type);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(photo.image));
});

// Resized thumbnail for gallery grids, generated on the fly from the stored master — public
app.get('/api/photos/:id/thumb', async (req, res) => {
  const photo = stmtGet.get(req.params.id);
  if (!photo) return res.sendStatus(404);
  try {
    const thumb = await sharp(photo.image)
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(thumb);
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    res.sendStatus(500);
  }
});

// Delete a photo — admin only
app.delete('/api/photos/:id', requireAuth, (req, res) => {
  const info = stmtDelete.run(req.params.id);
  if (info.changes === 0) return res.sendStatus(404);
  res.sendStatus(204);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Film portfolio running at http://localhost:${PORT}`);
});
