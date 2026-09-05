import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

// Lazily opened and cached on `global`: opening at module-load time breaks
// `next build`, which imports route handler modules in parallel workers to
// collect route metadata — several workers opening the same SQLite file at
// once trips "database is locked". Opening on first real use (i.e. the
// first actual request) avoids that entirely.
export function getDb() {
  if (global.__filmPortfolioDb) return global.__filmPortfolioDb;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, 'portfolio.db'));
  db.exec('PRAGMA journal_mode = WAL');

  // A group is a set of photos shown as one stacked card in the gallery;
  // clicking it expands to all of its photos. cover_photo_id picks which
  // photo's thumbnail/title/date represent the group on the gallery grid.
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cover_photo_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      photo_date TEXT,                -- optional: 'YYYY' or 'YYYY-MM'. NULL if unknown.
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      mime_type TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      image BLOB NOT NULL,            -- full-resolution, metadata-stripped image
      group_id INTEGER                -- NULL if standalone, else groups.id
    );
  `);

  // Migration for databases created before the `group_id` column existed —
  // CREATE TABLE IF NOT EXISTS above is a no-op on an already-existing table.
  const photoColumns = db.prepare(`PRAGMA table_info(photos)`).all();
  if (!photoColumns.some((c) => c.name === 'group_id')) {
    db.exec(`ALTER TABLE photos ADD COLUMN group_id INTEGER`);
  }

  global.__filmPortfolioDb = db;
  return db;
}
