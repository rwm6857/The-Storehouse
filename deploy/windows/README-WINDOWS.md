# The Storehouse - Windows Service Package

This folder describes the Windows ZIP artifact produced by the CI pipeline. The ZIP contains a portable Node runtime, the server source, built static assets, production `node_modules` (including `better-sqlite3`), and a WinSW service wrapper.

The ZIP is built by the GitHub Actions workflow at `.github/workflows/windows-zip.yml`. Local Windows build scripts are intentionally not supported.

## Install
1. Download the **Latest** GitHub Release asset (tag `latest`) named `Storehouse-win-x64.zip`.
2. Unzip the release to a stable location, for example `C:\Storehouse`.
3. Create your config file:
   ```bat
   copy C:\Storehouse\app\.env.example C:\Storehouse\app\.env
   notepad C:\Storehouse\app\.env
   ```
   Set `ADMIN_PASSCODE` (required), and optionally `PORT`, `HOST`, and `DATABASE_PATH`.
4. Open an **Administrator** PowerShell or Command Prompt.
5. Run:
   ```bat
   C:\Storehouse\scripts\install-service.bat
   ```

The service will start automatically on boot.

## Open the app
Run:
```bat
C:\Storehouse\scripts\open-storehouse.bat
```
This opens `http://localhost:3040` by default.

## Update
1. Download the new ZIP and extract it (any folder is fine).
2. Run the update script from the **current install**:
   ```powershell
   C:\Storehouse\scripts\update.ps1 -NewRoot "C:\Path\To\New\Storehouse"
   ```

The update process:
- stops the service
- replaces `app\src`, `app\node_modules`, and `VERSION.txt`
- preserves `app\data`, `app\config.json`, and `app\.env`
- restarts the service

## Uninstall
From an **Administrator** terminal:
```bat
C:\Storehouse\scripts\uninstall-service.bat
```

## Logs
Service logs are written next to the WinSW wrapper:
```
C:\Storehouse\service\
```
Look for `StorehouseService.out.log` and `StorehouseService.err.log`.

## Port configuration
Default port is **3040**. To change it:
- edit `C:\Storehouse\service\StorehouseService.xml` and change the `PORT` value
- then restart the service (or run `install-service.bat` again)

Optional: you can also create `C:\Storehouse\app\.env` with `PORT=xxxx`, but the service-level `PORT` setting takes precedence unless you remove it from the XML.

## Data location
The SQLite database lives at:
```
C:\Storehouse\app\data\storehouse.sqlite
```
(or the path specified by `DATABASE_PATH` in `.env`)
