# The Storehouse
A local micro-economy + snack bar web app for a church youth group. Runs on a Windows PC and is reachable from phones on the same LAN.

## Requirements
Development only:
- Node.js (LTS)
- A local network (Wi-Fi or Ethernet)

## Setup
1. Install Node.js (LTS).
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file:

```bash
cp .env.example .env
```

4. Edit `.env` with your admin passcode and (optional) database path.

## Windows install (production)
For a Windows 11 install that does **not** require Git/Node/npm/Python, use the ZIP artifact produced by CI. See the step-by-step guide in `deploy/windows/README-WINDOWS.md`.

## Build & release (Windows ZIP)
The only supported Windows packaging flow is the GitHub Actions workflow in `.github/workflows/windows-zip.yml`.
- On push to `main`, it builds `Storehouse-win-x64.zip` as a workflow artifact.
- On tags like `v1.2.3`, it also publishes a GitHub Release with the ZIP.

## Run
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Interactive terminal experience
When you start the server in a real terminal (PowerShell, Windows Terminal, macOS/Linux shells), The Storehouse now shows a small dashboard and accepts a few quick keys:

- `o` or `Enter` — open the web app in your default browser (uses the LAN URL when available).
- `l` — print the LAN URL for sharing with phones/tablets on Wi-Fi.
- `r` — refresh the info panel.
- `h` or `?` — show in-terminal help.
- `q` or `Ctrl+C` — quit gracefully.

Notes:
- Falls back to plain text when colors/TTY features are unavailable (e.g., background service).
- Disable the dashboard with `STOREHOUSE_NO_TUI=1`. Disable colors with `NO_COLOR=1` or `STOREHOUSE_NO_COLOR=1`.

## Access from phones/tablets on the same LAN
1. Find the PC’s local IP address:
   - Windows: open Command Prompt and run `ipconfig`.
   - Look for the IPv4 address (example: `192.168.1.25`).
2. On the phone/tablet, open:

```
http://<PC-IP>:3000
```

If you changed `PORT` in `.env`, use that port instead.
The server binds to `HOST=0.0.0.0` by default so phones can reach it on the LAN.

## Database location (outside repo)
The SQLite database path is configurable with `DATABASE_PATH`.

- Default: `./data/storehouse.sqlite`
- Recommended: set `DATABASE_PATH` to a folder outside the repo so you can safely publish the code.

Example:
```
DATABASE_PATH=C:\storehouse-data\storehouse.sqlite
```

## Backups
Copy the SQLite file defined by `DATABASE_PATH` to a safe location. That file contains all data.

## Security note
This app is for internal LAN use only. Do not expose it to the public internet.

## Seed demo data
To add 10 demo students and sample items:

```bash
npm run seed
```
