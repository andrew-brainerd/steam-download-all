# Steam Download All

Adds a **Download All** button to Steam that starts every pending game update at once. No more clicking through the Downloads page one game at a time.

The button starts everything Steam lists under **Scheduled** and **Not queued**. If downloads are paused overall, it unpauses them too. It makes the same call as Steam's own per-game "start now" button.

There are three versions, all built on the same core code:

| Version | Platform | Where the button appears | Needs |
|---|---|---|---|
| [Millennium plugin](#millennium-plugin-windows) | Windows | Downloads page header | [Millennium](https://steambrew.app) |
| [Standalone](#standalone-windows-no-millennium) | Windows | Downloads page header | Nothing else (uses Steam's DevTools port) |
| [Decky plugin](#decky-plugin-steam-deck--steamos) | Steam Deck / SteamOS | Quick Access Menu (`…`) | [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) |

## Install

### Windows installer (easiest)

Run `download-all-installer.exe` and choose:

- **With Millennium** (recommended): installs the plugin and turns it on. If Millennium isn't installed, the installer downloads its latest release from GitHub, checks it against the release's published SHA-256, and installs it first.
- **Standalone**: no Millennium. Installs the background app and turns on Steam's DevTools port (see the warning below).

The same installer can **Remove** Download All (either version) and, if you select it, Millennium's program files. Your Millennium settings, themes and other plugins are kept. Steam is closed with `steam.exe -shutdown` (force-closed only if it hasn't exited after a minute) and reopened when the installer finishes. Picking one version removes the other, so you never run both.

Build it with `pnpm build:installer`. That builds the Millennium plugin and standalone exe, embeds both, and writes `installer/src-tauri/target/release/download-all-installer.exe` (~95 MB, mostly the standalone app). The exe isn't code-signed, so SmartScreen may warn.

### Millennium plugin (Windows)

1. Install [Millennium](https://docs.steambrew.app/users/installing).
2. Build and install the plugin (see [Development](#development)): `pnpm install && pnpm build:millennium`. The build drops `dev.brainerd.download-all.star` into Steam's Millennium plugins folder.
3. In Steam, open **Millennium → Plugins**, turn on **Download All**, and restart Steam if asked.

### Standalone (Windows, no Millennium)

A small background program (`download-all.exe`) injects the button over Steam's local Chrome DevTools port.

1. Build it: `pnpm install && pnpm build:standalone` (produces `standalone/dist/download-all.exe`).
2. Run `standalone/install.ps1`. It:
   - copies the exe to `%LOCALAPPDATA%\DownloadAll`
   - creates `.cef-enable-remote-debugging` in the Steam folder, which turns on Steam's DevTools port (`127.0.0.1:8080`)
   - adds a **Download All** shortcut to your Startup folder and starts the exe
3. Restart Steam once (**Steam → Exit**, then reopen).

To remove it, run `standalone/uninstall.ps1`, then restart Steam.

> [!WARNING]
> While Steam's DevTools port is open, any program running on your PC can control the Steam client through it. Millennium doesn't have this exposure. Uninstalling removes the marker file and closes the port on the next Steam restart.

Logs go to `%LOCALAPPDATA%\DownloadAll\download-all.log`. The exe isn't code-signed, so Windows SmartScreen may warn the first time it runs.

### Decky plugin (Steam Deck / SteamOS)

1. On the Deck, in Desktop Mode: set a password (`passwd`), enable SSH (`sudo systemctl enable --now sshd`), and install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
2. From your PC: `pnpm install && pnpm deploy:deck`. If the Deck isn't reachable as `steamdeck.local`, set `DECK_HOST=<ip>`, and set `DECK_USER` if your user isn't `deck`. You'll be asked for the Deck's password for SSH and again for `sudo`. Running `ssh-copy-id deck@steamdeck.local` once removes the SSH prompt.
3. In Game Mode, open **… → Decky → Download All**. It lists the waiting games and has a **Download All (N)** button.

## How it works

All three versions run inside Steam's own UI JavaScript context (`SharedJSContext`) and share the code in `shared/`:

- **`shared/downloads.ts`** finds Steam's internal downloads store, the one behind the Downloads page. It does this by shape, through the loader's webpack module finder. It reads `ScheduledTransfers` and `UnqueuedTransfers`, and starts each one with `SteamClient.Downloads.ResumeAppUpdate(appid, clientId)`.
- **`shared/downloads-header.ts`** watches Steam's main window and adds the button to the Downloads page header each time that page mounts.

A few things the published typings get wrong, found the hard way:

- `RegisterForDownloadItems` passes items grouped per client (`[{ remote_client_id, item_data: [...] }]`), not a flat list. Reading the store avoids this, and also avoids missing the first callback.
- `ResumeAppUpdate` and `EnableAllDownloads` need the client ID as a second argument (`"0"` for this PC). Without it the calls quietly do nothing.
- The store's `m_DownloadItems` is a MobX observable map, so `instanceof Map` checks fail.
- Class-name values can contain several names (Millennium appends readable ones), so selectors use only the first.

## Development

This is a pnpm workspace:

```
shared/       Core logic shared by all three builds
millennium/   Millennium plugin (Starlight toolchain)
standalone/   DevTools injector + payload, packaged as a Node single-executable app
decky/        Decky Loader plugin (Rollup)
installer/    Windows installer (Tauri): Millennium-style UI, installs/removes either version and Millennium
```

| Command | What it does |
|---|---|
| `pnpm build:millennium` | Build and install the Millennium plugin into Steam |
| `pnpm dev:millennium` | Rebuild on change, hot-reload Steam, stream plugin logs |
| `pnpm build:standalone` | Build `standalone/dist/download-all.exe` |
| `pnpm build:installer` | Build the Windows installer with both versions embedded |
| `pnpm dev:installer` | Run the installer in dev mode (hot-reloads the UI) |
| `pnpm start:standalone` | Run the injector in the terminal (logs to stdout) |
| `pnpm build:decky` | Build the Decky plugin into `decky/dist` |
| `pnpm deploy:deck` | Build and deploy the Decky plugin to a Steam Deck over SSH |
| `pnpm typecheck` | Type-check all three packages |

### Releasing

Run `pnpm set-version <x.y.z>` (it updates all eight version fields, including `shared/version.ts`, which both Windows builds compare updates against), commit, then push a matching tag (`git tag v1.0.0 && git push origin v1.0.0`). `.github/workflows/release.yml` builds everything on a Windows runner, signs the update files, uploads the installer, the plugin `.star`, the standalone exe and a `latest.json` manifest to `s3://brainerd/apps/download-all/<version>/`, and attaches the installer to a GitHub Release. The download page at [brainerd.dev/apps/download-all](https://brainerd.dev/apps/download-all) reads that manifest, and its button counts downloads through brainerd-api (`/apps/download-all/download`) before redirecting to S3.

Repository secrets: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (the same ones Condensate uses), and `UPDATE_SIGNING_KEY` (the Ed25519 private key, PEM). The workflow refuses to sign with a key that doesn't match `UPDATE_PUBLIC_KEY` in `shared/updates.ts`.

### Updates

Both Windows versions check `latest.json` 30 seconds after starting and every 6 hours. When a newer version is published, an **Update to x.y.z** button appears next to Download All. Nothing installs until it's clicked.

- **Millennium plugin**: the Lua backend downloads the new `.star` (Steam's UI can't fetch from S3 because the bucket sends no CORS headers), the frontend verifies its Ed25519 signature with `tweetnacl`, and only then does the backend move it into place; Steam restarts to load it.
- **Standalone**: the background exe downloads and verifies the new exe with Node's crypto, stages it, and on click swaps itself (a running exe can be renamed), starts the new one and restarts Steam so the new button code loads.

The private signing key lives outside the repo (`~/.download-all/update-signing-key.pem` on the machine that generated it) and in the `UPDATE_SIGNING_KEY` secret. Keep a backup: losing it means existing installs can't verify future updates, and they'd have to reinstall from the website after the key is replaced in `shared/updates.ts`.

Requirements: Node 24+, pnpm 11. Deploying to a Deck needs `ssh` and `scp`, which Git for Windows includes.

These are Steam's internal APIs, not a supported interface, so a Steam client update can break them. If the button stops appearing or stops working, the store lookup (`shared/downloads.ts`) and the class lookup (`isDownloadsClassModule`) are the first things to check.
