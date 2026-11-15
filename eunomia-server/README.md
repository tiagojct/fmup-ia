# Eunomia server

Node 22 server of Eunomia, the activity design assistant of FMUP · IA. The design is in
`docs/superpowers/specs/2026-11-14-eunomia-design.md`. The front end is in `../eunomia/`. Quarto
copies it to the site, and the site serves it at `https://tiagojacinto.eu/fmup-ia/eunomia/`.

- API path: `/fmup-ia/eunomia/api`. The server receives the full path. Caddy uses `handle`, not `handle_path`.
- Port: 3000. Health route: `GET /fmup-ia/eunomia/api/saude` answers `{"ok":true}`.
- Runtime dependency: `ajv`. No build step.
- The server reads data files of the repository: `eunomia/*.json`, `themis/policy.json`,
  `themis/policy-rules.js`, `themis/i18n/pt.js` and `_variables.yml`. `EUNOMIA_REPO_ROOT` sets the
  folder that holds them. Default: the parent folder of `eunomia-server/`.

## Run and test on the Mac

1. Install: `npm ci --prefix eunomia-server`.
2. Test: `npm test --prefix eunomia-server`. The front-end tests: `npm ci --prefix eunomia/test`, then `npm test --prefix eunomia/test`.
3. Copy `.env.example` to `.env` in `eunomia-server/`. Set `EUNOMIA_SECRET` (32 or more characters, for example `openssl rand -hex 32`).
4. Start: `cd eunomia-server && node --env-file=.env src/main.js`.
5. Check: `curl -fsS localhost:3000/fmup-ia/eunomia/api/saude`. Expected: `{"ok":true}`.

The session cookie is `Secure`, so a browser login works only over HTTPS. Use the tests or `curl` on the Mac.

## Settings

The names are in `.env.example`. The values never go in git.

| Name | Default | Use |
|---|---|---|
| `EUNOMIA_SECRET` | none | Signs the session cookies. 32 or more characters. The server does not start without it. |
| `EUNOMIA_DATA` | `./data` | Data folder. In the image: `/app/data`. |
| `EUNOMIA_DAILY_LIMIT` | 200 | Model calls for each code and day. |
| `EUNOMIA_DRAFT_RETENTION_DAYS` | 365 | Drafts that nobody opened for this many days are deleted. |
| `IAEDU_BASE_URL` | `https://api.iaedu.pt/agent-chat/api/v1` | IAedu endpoint. |
| `IAEDU_API_KEY`, `IAEDU_AGENT_ID`, `IAEDU_CHANNEL_ID` | none | Shared key (GPT-4o agent). |
| `IAEDU_ALT_API_KEY`, `IAEDU_ALT_AGENT_ID`, `IAEDU_ALT_CHANNEL_ID` | none | Alternative model (AMALIA), with `?modelo=amalia`. |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `COMMIT_NAME`, `COMMIT_EMAIL` | repo `tiagojct/fmup-ia`, branch `main` | Library commits (later task). |

A teacher can use an own IAedu key (settings page of the front end). The browser sends it in the
headers `X-Iaedu-Key`, `X-Iaedu-Agent` and `X-Iaedu-Channel`. The server never stores or logs it.

## Access codes

The server stores only a hash of each code. A code is shown once, when it is made.

- `node bin/codes.js add "<name>"` makes a teacher code. Add `--admin` for an admin code.
- `node bin/codes.js list` lists the codes (never the code itself).
- `node bin/codes.js revoke <id>` revokes a code. Its sessions stop at once.
- In the container: `docker exec eunomia node bin/codes.js add "<name>"`.
- An admin can also list, add and revoke codes in the front end, page `#/codigos`.

CAUTION: `bin/codes.js` and the API both write `data/codes.json`, and there is no lock. Do not run
`bin/codes.js` while someone adds or revokes a code on the `#/codigos` page. A write can replace the
other one.

## Image

- `Dockerfile` (this folder). Build context: the repository root.
  `docker build -f eunomia-server/Dockerfile -t eunomia:local .`
- `.dockerignore` (repository root) keeps only the files that the image copies.
- The image runs as `node` (uid 1000). It sets `EUNOMIA_REPO_ROOT=/app/repo` and `EUNOMIA_DATA=/app/data`.
- `.github/workflows/eunomia-image.yml` tests the server, then builds and pushes
  `ghcr.io/tiagojct/eunomia` with the tags `latest` and the commit SHA, and the label
  `org.opencontainers.image.revision`. It runs on a push to main that changes the server, the data
  files it reads, or the workflow.
- `.github/workflows/publish.yml` runs the front-end and server tests before it publishes the site.

## Deploy on Rokovoko

Do these steps one time, in this order. Ask Tiago before each write on the server. The Rokovoko
runbook (`powerslave/systems/rokovoko.md`) is the reference for Caddy and the apps.

1. Push the branch to main. Make sure that the workflows `eunomia-image` and `Publish` pass. The image
   `ghcr.io/tiagojct/eunomia:latest` must exist, and `https://tiagojacinto.eu/fmup-ia/eunomia/` must
   show the login page.
2. Make the app folder (`/opt/vps/apps` belongs to root, so Tiago runs these with sudo):

   ```sh
   sudo mkdir -p /opt/vps/apps/eunomia/data
   sudo chown -R 1000:1000 /opt/vps/apps/eunomia
   sudo chmod 700 /opt/vps/apps/eunomia/data
   ```

3. Copy the compose file from the Mac:

   ```sh
   scp eunomia-server/deploy/docker-compose.yml roko:/opt/vps/apps/eunomia/docker-compose.yml
   ```

4. Make the `.env` file on the server, mode 600, owner 1000:1000:

   ```sh
   cd /opt/vps/apps/eunomia
   install -m 600 /dev/null .env
   nano .env
   ```

   Set `EUNOMIA_SECRET` (the output of `openssl rand -hex 32`), `IAEDU_API_KEY`, `IAEDU_AGENT_ID` and
   `IAEDU_CHANNEL_ID`. Leave `EUNOMIA_DATA` empty: the default is `/app/data`. Check with
   `ls -l .env`: `-rw------- 1 tiagojct tiagojct`.
5. Add the pull marker: `touch /opt/vps/apps/eunomia/.quarterdeck-pull`.
6. Start the container:

   ```sh
   cd /opt/vps/apps/eunomia
   docker compose pull
   docker compose up -d
   docker compose ps
   docker logs eunomia --tail 20
   ```

   Expected: the state is `healthy` after about 30 seconds, and the log has
   `{"evento":"arranque","porta":3000}`. If the log says that the data folder is not writable, do
   step 2 again.
7. Check that Caddy reaches the container on the network `proxy`:

   ```sh
   docker exec caddy wget -qO- http://eunomia:3000/fmup-ia/eunomia/api/saude
   ```

   Expected: `{"ok":true}`.
8. Change the Caddyfile. Make a copy first:

   ```sh
   mkdir -p ~/.ops
   cp /opt/vps/caddy/Caddyfile ~/.ops/Caddyfile.bak-$(date -u +%Y%m%dT%H%M%SZ)
   cp /opt/vps/caddy/Caddyfile ~/Caddyfile.new
   nano ~/Caddyfile.new
   ```

   In the snippet `(route_tiagojacinto)`, put this block BEFORE the line `handle_path /fmup-ia/*`:

   ```caddyfile
   handle /fmup-ia/eunomia/api/* {
   	reverse_proxy eunomia:3000
   }
   ```

   Use `handle`, not `handle_path`: the server needs the full path. Do not remove the header
   `CF-Connecting-IP` (no `header_up -CF-Connecting-IP`): the login limit needs it.
9. Write the Caddyfile in place (the file is a bind mount, so do not use `cp` or `mv`), validate it and
   reload Caddy:

   ```sh
   sudo tee /opt/vps/caddy/Caddyfile < ~/Caddyfile.new > /dev/null
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   If the validation fails, write the copy of step 8 back with `sudo tee` and stop.
10. Check the public routes:

    ```sh
    curl -fsS https://tiagojacinto.eu/fmup-ia/eunomia/api/saude
    curl -s -o /dev/null -w '%{http_code}\n' https://tiagojacinto.eu/fmup-ia/eunomia/
    curl -s -o /dev/null -w '%{http_code}\n' https://tiagojacinto.eu/fmup-ia/
    ```

    Expected: `{"ok":true}`, `200`, `200`.
11. Check that `CF-Connecting-IP` reaches the container. The login limit is 5 attempts a minute for
    each client address. If the header does not arrive, all colleagues share one counter. From the
    Mac, send 6 wrong codes:

    ```sh
    for i in 1 2 3 4 5 6; do
      curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
        -d '{"codigo":"ERRADO"}' https://tiagojacinto.eu/fmup-ia/eunomia/api/login
    done
    ```

    Expected: `401` five times, then `429`. Then, in the same minute, open the login page on a phone
    on mobile data (another address) and enter a wrong code. Expected: "Código inválido.". If the
    phone shows "Demasiadas tentativas", the header does not reach the container: stop and check
    the Caddy block.
12. Make the first admin code:

    ```sh
    docker exec eunomia node bin/codes.js add "Tiago Jacinto" --admin
    ```

    The code is shown once. Keep it in Vaultwarden. Log in at
    `https://tiagojacinto.eu/fmup-ia/eunomia/` and make the teacher codes on the page "Códigos de
    acesso".
13. Add a line to the change log of the Rokovoko runbook, and add `eunomia` to the table of compose
    projects (path of tiagojacinto.eu, image from GHCR, pulled by quarterdeck-pull).

## Updates, rollback and backup

- Update: a push to main builds a new `latest`. quarterdeck-pull pulls it within 5 minutes.
  Logs: `journalctl --user -u quarterdeck-pull`.
- Rollback: in `/opt/vps/apps/eunomia/docker-compose.yml`, set the image to
  `ghcr.io/tiagojct/eunomia:<commit SHA>`, then `docker compose up -d`. Set it back to `latest` after the fix.
- Backup: the nightly restic backup covers `/opt/vps/apps`, so `data/` is in it.
- Data in `data/`: `codes.json`, `rascunhos/<code id>/<draft id>.json`, `usage.json`. The logs have
  the method, the path, the status and the time of each request only.
