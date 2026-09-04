# Film Portfolio

A small self-hosted Next.js website for hosting your photographs.

Every uploaded photo is automatically:
- **Stripped of metadata** — the image is re-encoded, which drops EXIF/GPS/IPTC/XMP data (the EXIF *orientation* is read and baked into the pixels first, so rotated photos still display correctly).
- **Stored full resolution** — the processed image is saved as a BLOB in a local SQLite database (`data/portfolio.db`), alongside its title and date.

Each photo gets a title (required) and a date taken (optional) — just a year (e.g. `2024`) or a year and month (e.g. `July 2024`); no day is collected.

Thumbnails for the gallery grid are generated on the fly from the stored master, so only one copy of each photo is kept.

## Admin login

The gallery itself is public — anyone with the URL can browse and view photos. Uploading, editing, and deleting require logging in at the hidden **`/login`** page (it's not linked anywhere in the UI).

There's a single shared admin password, not per-user accounts:
- Set your own via the `ADMIN_PASSWORD` environment variable, **or**
- Leave it unset and the server generates a random one on first run, prints it to the console once, and persists its hash to `data/admin-credentials.json`. Save that printed password — it's shown only once.

Logging in sets an HTTP-only session cookie (30-day expiry, in-memory sessions — restarting the server logs everyone out). Failed login attempts are rate-limited (5 tries, then a 15-minute lockout per IP).

## Setup

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**. For a production run instead: `npm run build && npm start`.

## Running with Docker

```bash
docker compose up -d --build
```

Then open **http://localhost:3000**. The SQLite database is bind-mounted to `./data` on the host, so photos survive container rebuilds/restarts — `docker compose down` (without `-v`; there's no named volume to remove anyway) is safe.

If port 3000 is already taken on your machine, change the host side of the port mapping in `docker-compose.yml` (e.g. `"3010:3000"`) before running `up`.

To stop it: `docker compose down`.

## Notes

- Data lives entirely in `data/portfolio.db` — back that one file up to back up the whole site.
- Accepted formats: anything `sharp`/libvips can decode (JPEG, PNG, WebP, TIFF, GIF, AVIF, HEIC*). Output is always re-encoded as JPEG.
- Max upload size: 40MB per photo (edit `MAX_UPLOAD_BYTES` in `app/api/photos/route.js` to change).
- Uploading, editing, and deleting require logging in at `/login` (see **Admin login** above); browsing the gallery does not. If you expose this beyond `localhost`, put it behind HTTPS (e.g. a reverse proxy) so the session cookie and password aren't sent in the clear.
