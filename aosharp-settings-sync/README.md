# SettingsSync (AOSharp2 plugin)

Keeps Anarchy Online's client settings (normally written only to
`%AppData%\Funcom\Anarchy Online\Prefs`) mirrored into a `PrefsBackup` folder
inside the game install directory, so your settings travel with the game
folder (backups, syncing between machines, version control, etc.) instead of
being stranded in AppData.

## How it works

- On login, it compares the last-modified times of the AppData `Prefs` folder
  and the local `PrefsBackup` folder and copies the newer one over the older
  one, file by file (never blindly overwrites in one fixed direction).
- While you play, a `FileSystemWatcher` watches the AppData `Prefs` folder and
  mirrors any changes into `PrefsBackup` (debounced ~1.5s after the last
  write) so the game-folder copy never goes stale.
- Manual control via chat command:
  - `/settingssync status` — show both paths and whether they exist
  - `/settingssync pull` — force-copy AppData → game folder
  - `/settingssync push` — force-copy game folder → AppData (use this if you
    want to restore a backed-up `PrefsBackup` folder onto a fresh install)

## Build

Requires a local AOSharp2 install for its `AOSharp.Core.dll` /
`AOSharp.Common.dll` reference assemblies.

```bash
dotnet build SettingsSync.csproj -p:AOSharpDir="C:\path\to\AOSharp2" -p:Configuration=Release
```

If your AOSharp2 distribution names/locates those DLLs differently, edit the
`<Reference>` `HintPath`s in `SettingsSync.csproj` to match.

## Install

Copy the built `SettingsSync.dll` into your AOSharp2 `Plugins\SettingsSync\`
folder (each plugin typically lives in its own subfolder) and enable it the
same way you enable other AOSharp2 plugins.

## Notes / assumptions

- Written against the AOSharp2 plugin API shape used by community plugins:
  `AOPluginEntry` with `Run(string pluginDir)` / `Teardown()`, and
  `Chat.RegisterCommand(name, callback)` / `Chat.WriteLine(...)`. If your
  AOSharp2 build's API differs slightly (rename/signature), adjust
  `SettingsSyncPlugin.cs` accordingly — the sync logic itself (`CopyTree`,
  `SyncNewestWins`, the `FileSystemWatcher`) is plain .NET and doesn't depend
  on AOSharp at all.
- Targets `net472` / x86 to match the classic AO client process; change
  `TargetFramework`/`PlatformTarget` in the `.csproj` if your AOSharp2 build
  targets something else.
