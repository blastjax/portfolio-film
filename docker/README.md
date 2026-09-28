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
`caddy`, since Caddy's automatic HTTPS needs a real public domain.

## Hosting: shared Lightsail host (edge proxy)

The site is hosted on the Lightsail instance it shares with the `blastjax` and `icrc` sites. The
one-time move there is described in the `blastjax` repo's `docker/edge/README.md`. That instance runs
one shared Caddy, the **edge proxy**, which the `blastjax` repo owns. It terminates TLS for every site
there, so this stack's own `caddy` service doesn't run on it:

- `docker-compose.edge.yml` attaches `web` to the shared `edge` network as `portfolio-web`, and keeps
  `caddy` off.
- `docker/Caddyfile` is this site's block. The deploy installs it into the edge proxy as
  `/srv/edge/caddy/sites/portfolio.caddy` and hot-reloads it without restarting the proxy.

The deploy picks the mode by itself. If the host has the edge proxy (`/srv/edge/bin/edge-install`
exists), it uses edge mode. Otherwise it falls back to the standalone stack with its own Caddy on
ports 80/443, as before. Local runs are unaffected either way, because `docker-compose.edge.yml` is
only read when passed with `-f`.

## Deploying

Push to `main` (or run the workflow manually) — see `.github/workflows/deploy.yml`. It builds and
pushes the image to GHCR, then SSHes into the Lightsail host to `git pull`, `docker compose pull`,
and `docker compose up -d`, failing the job if the container doesn't report healthy (or, on the
shared host, if the edge proxy can't reach it). If `APP_DIR` doesn't exist on the host yet, the first
deploy checks the repo out there itself.

Required repo secrets:

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | Private key for the `ubuntu` user on the host (the shared host's key is the same as the `blastjax` repo's) |
| `DEPLOY_HOST` | The host's IP or hostname |
| `APP_DIR` | Path to the repo clone on the host, e.g. `/home/ubuntu/film-portfolio` |
| `ADMIN_PASSWORD` | *(optional)* Fixes the admin password instead of letting one auto-generate |
