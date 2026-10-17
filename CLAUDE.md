# steam-download-all

A "Download All" button for Steam in three builds that share `shared/`: `millennium/` (Windows, Millennium plugin), `standalone/` (Windows, DevTools-port injector exe) and `decky/` (Steam Deck). See README.md for install and commands.

- Load the **steam-client** skill (`~/.claude/skills/steam-client/`) before changing anything that touches Steam internals, the DevTools port, Millennium or Decky.
- Run `pnpm typecheck` after every change; rebuild the affected build(s) (`pnpm build:millennium`, `pnpm build:standalone`, `pnpm build:decky`).
- Changes in `shared/` affect all three builds — rebuild and reinstall both Windows builds (`standalone/install.ps1` replaces the running exe).
- Restarting Steam interrupts the user's downloads: ask first, use `steam.exe -shutdown`.
- No narrative comments in code; put the "why" in README.md.
- Versions: change them only with `pnpm set-version <x.y.z>` (eight files must agree; CI checks the tag, `installer/package.json` and `shared/version.ts`).
- Updates must stay signed: never add a code path that installs a downloaded `.star` or exe without verifying it against `UPDATE_PUBLIC_KEY`. The private key is never committed.
