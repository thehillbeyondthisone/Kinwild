using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Timers;
using AOSharp.Core;

namespace SettingsSync
{
    /// <summary>
    /// AOSharp2 plugin that keeps the client's "Prefs" settings (normally written only
    /// to %AppData%\Funcom\Anarchy Online\Prefs) mirrored into a folder next to the
    /// game install, so settings can be backed up / moved / version-controlled along
    /// with the rest of the game folder.
    ///
    /// Sync direction on load: whichever copy (AppData vs game-folder) was modified
    /// most recently "wins" and is copied over the other, file by file. After that,
    /// a FileSystemWatcher mirrors any live AppData changes into the game folder copy
    /// so it never goes stale while you play.
    /// </summary>
    public class SettingsSyncPlugin : AOPluginEntry
    {
        private const string LocalMirrorFolderName = "PrefsBackup";
        private const string CommandName = "settingssync";

        private string _gameDir;
        private string _appDataPrefsDir;
        private string _localMirrorDir;

        private FileSystemWatcher _watcher;
        private Timer _debounceTimer;
        private readonly object _syncLock = new object();

        public override void Run(string pluginDir)
        {
            _gameDir = Directory.GetCurrentDirectory();
            _appDataPrefsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Funcom", "Anarchy Online", "Prefs");
            _localMirrorDir = Path.Combine(_gameDir, LocalMirrorFolderName);

            try
            {
                Chat.RegisterCommand(CommandName, OnCommand);
            }
            catch (Exception ex)
            {
                Chat.WriteLine($"[SettingsSync] Could not register /{CommandName} command: {ex.Message}");
            }

            SyncNewestWins();
            StartWatcher();

            Chat.WriteLine($"[SettingsSync] Watching '{_appDataPrefsDir}' and mirroring into '{_localMirrorDir}'.");
            Chat.WriteLine($"[SettingsSync] Use /{CommandName} push|pull|status to sync manually.");
        }

        public override void Teardown()
        {
            _watcher?.Dispose();
            _debounceTimer?.Dispose();
        }

        private void OnCommand(string command, string[] param, ChatWindow chatWindow)
        {
            string sub = param.Length > 0 ? param[0].ToLowerInvariant() : "status";

            switch (sub)
            {
                case "pull": // AppData -> game folder
                    CopyTree(_appDataPrefsDir, _localMirrorDir);
                    Chat.WriteLine("[SettingsSync] Pulled AppData settings into the game folder.");
                    break;

                case "push": // game folder -> AppData
                    CopyTree(_localMirrorDir, _appDataPrefsDir);
                    Chat.WriteLine("[SettingsSync] Pushed game-folder settings into AppData.");
                    break;

                case "status":
                default:
                    Chat.WriteLine($"[SettingsSync] AppData:  {_appDataPrefsDir} (exists: {Directory.Exists(_appDataPrefsDir)})");
                    Chat.WriteLine($"[SettingsSync] Mirror:   {_localMirrorDir} (exists: {Directory.Exists(_localMirrorDir)})");
                    break;
            }
        }

        /// <summary>
        /// On startup, decide which side has the freshest data and copy it onto the
        /// other, rather than blindly overwriting either one.
        /// </summary>
        private void SyncNewestWins()
        {
            lock (_syncLock)
            {
                bool appDataExists = Directory.Exists(_appDataPrefsDir);
                bool mirrorExists = Directory.Exists(_localMirrorDir);

                if (!appDataExists && !mirrorExists)
                {
                    Chat.WriteLine("[SettingsSync] No settings found on either side yet; nothing to sync.");
                    return;
                }

                if (appDataExists && !mirrorExists)
                {
                    CopyTree(_appDataPrefsDir, _localMirrorDir);
                    return;
                }

                if (!appDataExists && mirrorExists)
                {
                    CopyTree(_localMirrorDir, _appDataPrefsDir);
                    return;
                }

                DateTime appDataNewest = GetNewestWriteTime(_appDataPrefsDir);
                DateTime mirrorNewest = GetNewestWriteTime(_localMirrorDir);

                if (appDataNewest >= mirrorNewest)
                    CopyTree(_appDataPrefsDir, _localMirrorDir);
                else
                    CopyTree(_localMirrorDir, _appDataPrefsDir);
            }
        }

        private static DateTime GetNewestWriteTime(string dir)
        {
            try
            {
                return Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories)
                    .Select(File.GetLastWriteTimeUtc)
                    .DefaultIfEmpty(DateTime.MinValue)
                    .Max();
            }
            catch
            {
                return DateTime.MinValue;
            }
        }

        private void StartWatcher()
        {
            if (!Directory.Exists(_appDataPrefsDir))
                return;

            _watcher = new FileSystemWatcher(_appDataPrefsDir)
            {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.DirectoryName,
                EnableRaisingEvents = true
            };

            _watcher.Changed += (s, e) => ScheduleMirror();
            _watcher.Created += (s, e) => ScheduleMirror();
            _watcher.Renamed += (s, e) => ScheduleMirror();
            _watcher.Deleted += (s, e) => ScheduleMirror();

            // Debounce: the game can write several settings files in a burst
            // (e.g. on logout), so wait for things to go quiet before copying.
            _debounceTimer = new Timer(1500) { AutoReset = false };
            _debounceTimer.Elapsed += (s, e) =>
            {
                lock (_syncLock)
                {
                    CopyTree(_appDataPrefsDir, _localMirrorDir);
                }
            };
        }

        private void ScheduleMirror()
        {
            _debounceTimer?.Stop();
            _debounceTimer?.Start();
        }

        private static void CopyTree(string sourceDir, string destDir)
        {
            if (!Directory.Exists(sourceDir))
                return;

            Directory.CreateDirectory(destDir);

            foreach (string dir in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
            {
                string relative = dir.Substring(sourceDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                Directory.CreateDirectory(Path.Combine(destDir, relative));
            }

            foreach (string file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
            {
                string relative = file.Substring(sourceDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string destPath = Path.Combine(destDir, relative);

                try
                {
                    if (!File.Exists(destPath) || File.GetLastWriteTimeUtc(file) > File.GetLastWriteTimeUtc(destPath))
                    {
                        Directory.CreateDirectory(Path.GetDirectoryName(destPath) ?? destDir);
                        File.Copy(file, destPath, true);
                    }
                }
                catch (IOException)
                {
                    // File briefly locked by the client while it's writing; it will
                    // get picked up on the next debounce tick.
                }
            }
        }
    }
}
