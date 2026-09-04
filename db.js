const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'portfolio.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    photo_date TEXT,                -- optional: 'YYYY' or 'YYYY-MM', user-supplied. NULL if unknown.
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    image BLOB NOT NULL             -- full-resolution, metadata-stripped image
  );
`);

module.exports = db;
