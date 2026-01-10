# The Storehouse
A local micro-economy + snack bar web app for a church youth group. Runs on a Windows PC and is reachable from phones on the same LAN.

## Requirements
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

## Windows setup guide (first time)
1. Install Node.js (LTS):
   - Go to the official Node.js site and download the LTS installer for Windows.
   - Run the installer with defaults.
2. Install Git for Windows:
   - Download Git for Windows and install with defaults.
3. Open PowerShell and choose a folder for the app, then clone the repo:

```powershell
git clone https://github.com/<your-org-or-user>/<your-repo>.git
cd <your-repo>
```

4. Install dependencies:

```powershell
npm install
```

5. Create your `.env` file:

```powershell
copy .env.example .env
```

6. Edit `.env` (use Notepad) and set the passcode + database location:

```powershell
notepad .env
```

Recommended example:
```
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=C:\\storehouse-data\\storehouse.sqlite
ADMIN_PASSCODE=change-me
```

7. Create the database folder if it does not exist:

```powershell
mkdir C:\\storehouse-data
```

8. Start the app:

```powershell
npm start
```

9. Optional: Use the launcher window:
   - Double-click `scripts\\windows\\Storehouse-Launcher.cmd`

## Run
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

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

## Updating the Windows app (Git)
From PowerShell inside the repo:

```powershell
git pull
npm install
```

Then restart the server or re-open the launcher.

## Windows launcher (optional)
You can use a small launcher window with Start/Stop/Open buttons:

1. Double-click `scripts/windows/Storehouse-Launcher.cmd`.
2. Click **Start Server**.
3. Click **Open Web App** to launch the correct URL in your browser.

To make it easy:
- Create a desktop shortcut to `scripts/windows/Storehouse-Launcher.cmd`.

## Build a true Windows .exe (optional)
This creates a standalone `TheStorehouse.exe` using `pkg`.

1. On a Windows PC, open PowerShell in the repo folder.
2. Run:

```powershell
scripts\\windows\\build-exe.ps1
```

The executable will be created at:

```
dist\\TheStorehouse.exe
```

Notes:
- The `.env` file should live next to the `.exe` or you can set environment variables in Windows.
- The SQLite file path is still controlled by `DATABASE_PATH`.

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
