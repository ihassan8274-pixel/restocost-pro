# legacy-deploy — deployment helpers from the pre-PM2 era

Moved here on 2026-10-08 as part of the root cleanup. Nothing in this folder runs
anymore, and nothing outside it references these files (checked against
`package.json` scripts, `.github/workflows/*.yml`, and the live autostart folder
`C:\RestoCost-Autostart\*.cmd|ps1|vbs`, which only ever points at `server/`).

**The stack is supervised by PM2, not by any of these:**

| What | Where it lives now |
|---|---|
| Server (port 3001) | `pm2` app `restocost` → `server/dist/index.js` |
| Cloudflare tunnel (`erp.restocost.shop`) | `pm2` app `cloudflared-restocost` |
| Bring-up on logon | scheduled task `RestoCost PM2 Startup` → `scripts/setup-pm2-startup.ps1` |
| pm2 config (holds the live `SECRETS_KEY`) | `ecosystem.config.cjs` (gitignored on purpose) |

Two supervisors is what caused the 502 on 2026-10-08: `start-all.cmd` and
`docker-watchdog.ps1` (still in `C:\RestoCost-Autostart`, outside this repo) also
start a tunnel connector, so four connectors were serving one tunnel. `start.bat`
and friends here predate that and must not be used to start anything.

## What is in here

- **IIS / ARR** — `setup-iis-site.ps1`, `setup-iis-admin.bat`, `fix-iis-site.ps1`,
  `enable-arr-and-start.bat`. The public endpoint is a Cloudflare tunnel, not IIS.
- **Port fixers** — `fix-ports.bat`, `fix-erpnext-host.bat`, `check-ports.ps1`,
  `check-links.ps1`, `check-restart.ps1`.
- **Old start/stop** — `start.bat`, `stop-both.bat`, `start-both.bat`,
  `start-server.cmd`, `start-site-system.bat`, `setup.bat`.
- **Autostart registration (Windows shortcuts)** — `setup-autostart.ps1`,
  `setup-autostart.bat`, `register-startup-shortcut.ps1`. Superseded by the
  scheduled task above; `toggle-autostart.ps1` in `C:\RestoCost-Autostart`
  manages that task now.
- **VBS launchers / shortcuts** — `RestoCost ERP Pro.vbs`, `Rebuild Shortcuts.vbs`,
  `Create Company Copy.vbs`, plus `DEPLOY-INSTRUCTIONS.txt`.

## Still in the project root (deliberately NOT moved)

`docker-compose.yml`, `init.sql`, `docker-entrypoint.server.sh`, `nginx-spa.conf`,
`web.config`, `schema.sql`, `install.sh`, `start.sh`, `stop.sh` — these form one
coherent deployment story and the CI workflow discusses them by name. They are
inert for the live site but are kept addressable at the root on purpose.

## If you need one of these again

`git mv legacy-deploy/<file> .` — every file here is tracked, so its full history
follows it back.