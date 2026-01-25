# The Storehouse - Windows Service Package

This folder describes the Windows ZIP artifact produced by the CI pipeline. The ZIP contains a portable Node runtime, the server source, built static assets, production `node_modules` (including `better-sqlite3`), and a WinSW service wrapper.

The ZIP is built by the GitHub Actions workflow at `.github/workflows/windows-zip.yml`. Local Windows build scripts are intentionally not supported.

## Install
1. Download the **Latest** GitHub Release asset (tag `latest`) named `TheStorehouse-win-x64.zip`.
2. Unzip the release to a stable location, for example `C:\TheStorehouse`.
3. Create/update your config file:
   ```bat
   notepad "C:\ProgramData\The Storehouse\config\config.json"
   ```
   Set `admin_passcode` (required), and optionally `port`, `host`, and `database_path`.
4. Open an **Administrator** PowerShell or Command Prompt.
5. Run:
   ```bat
   C:\TheStorehouse\scripts\install-service.bat
   ```

The service will start automatically on boot.
The tray app will auto-start for all users and provides Start/Stop/Open/Quit.

## Open the app
Run:
```bat
   C:\TheStorehouse\scripts\open-storehouse.bat
```
This opens `http://localhost:3040` by default.

## Tray app (system tray menu)
The Windows package includes a small tray app at:
```
C:\TheStorehouse\tray\TheStorehouseTray.exe
```
The install script registers it to auto-start at login. Right-click the tray icon to:
- Open the app (localhost)
- Start/Stop the service
- Quit (stops the service and exits the tray app)
If Start/Stop prompts for elevation, accept the UAC prompt or run the tray app as Administrator.

If you want to disable the tray app auto-start:
```bat
reg delete "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v "TheStorehouseTray" /f
```

## Update
1. Download the new ZIP and extract it (any folder is fine).
2. Run the update script from the **current install**:
   ```powershell
   C:\TheStorehouse\scripts\update.ps1 -NewRoot "C:\Path\To\New\TheStorehouse"
   ```

The update process:
- stops the service
- replaces `app\src`, `app\node_modules`, and `VERSION.txt`
- preserves `C:\ProgramData\The Storehouse` data and config
- restarts the service

## Uninstall
From an **Administrator** terminal:
```bat
   C:\TheStorehouse\scripts\uninstall-service.bat
```

## Logs
Service logs are written to ProgramData:
```
C:\ProgramData\The Storehouse\logs\
```
Look for `TheStorehouseService.out.log` and `TheStorehouseService.err.log`.

## Port configuration
Default port is **3040**. To change it:
- edit `C:\TheStorehouse\service\TheStorehouseService.xml` and change the `PORT` value
- then restart the service (or run `install-service.bat` again)

Optional: you can also create `C:\TheStorehouse\app\.env` with `PORT=xxxx`, but the service-level `PORT` setting takes precedence unless you remove it from the XML.

## Data location
The SQLite database lives at:
```
C:\ProgramData\The Storehouse\data\storehouse.sqlite
```
(or the path specified by `database_path` in `config.json`)
