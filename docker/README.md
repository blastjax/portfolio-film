# Docker

## Database & admin credentials

The app stores everything in a local SQLite file plus a small credentials file, both under the
repo-root **`./data`** directory, bind-mounted into the `web` container at `/app/data`. Nothing to
provision before starting the container — the app creates `portfolio.db` (and, on first run,
`admin-credentials.json` if `ADMIN_PASSWORD` isn't set) itself.

## Builds (cache + image size)

- **BuildKit** cache mounts in the Dockerfile cache npm's download cache and Next's compiler cache,
  so rebuilds after a dependency change are much faster than a cold build.
- The image ships a **[Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)**
  bundle (`node server.js`) instead of the full `node_modules` tree.
- In CI (`.github/workflows/deploy.yml`), the image is built on the GitHub Actions runner and pushed
  to GHCR — not built on the Lightsail host, which only has 1GB RAM.

## Run locally

From the **repository root**:

```bash
docker compose up --build web
```

- Web: `http://localhost:3000`
- Database file: `./data/portfolio.db` on the host

`docker-compose.override.yml` (auto-merged locally) publishes `web`'s port directly and skips
`caddy`, since Caddy's automatic HTTPS needs a real public domain. The production compose file
(`docker-compose.yml` alone, as deployed on the Lightsail host) publishes no port for `web` — only
Caddy is public, terminating TLS for `portfolio.maiacruz.com` and reverse-proxying to `web:3000`.

## Deploying

Push to `main` (or run the workflow manually) — see `.github/workflows/deploy.yml`. It builds and
pushes the image to GHCR, then SSHes into the Lightsail host to `git pull`, `docker compose pull`,
and `docker compose up -d`, failing the job if the container doesn't report healthy.

Required repo secrets:

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | Private key for the `ubuntu` user on the host |
| `DEPLOY_HOST` | The host's IP or hostname |
| `APP_DIR` | Path to the repo clone on the host, e.g. `/home/ubuntu/film-portfolio` |
| `ADMIN_PASSWORD` | *(optional)* Fixes the admin password instead of letting one auto-generate |
