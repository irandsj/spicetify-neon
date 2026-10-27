# Changelog

## 1.0.2 (2026-10-27)

Checked with Spotify 1.3.6.1921 (Spicetify 2.45.3, Windows 11), offline only: against Spotify's code, not yet in a
live Spotify. **Spotify 1.3.6 renamed all of its scrambled class names**, so on 1.3.6 the theme is only partly
applied for now.

**NeonDrift Ambient** (extension)
- The top-bar button finds its usual place (just before "What's New") on Spotify 1.3.6 again. Before, it fell back
  to the spot next to the profile button. `NeonDriftAmbient.compat()` knows the 1.3.6 names too.
- Nothing else changed: ambient mode, the visualizers and the panel rely on Spicetify's APIs, not on Spotify's classes.

**NeonDrift** (theme)
- 16 classes that Spicetify's class map already names on Spotify 1.3.6 now work there: top bar background and
  overlay, back / forward buttons, top-bar icons, generic buttons (and their active state and dot), the now-playing
  bar, Home shortcuts, playlist content, subtitle, footer and inline-curation buttons, and the header's image
  placeholder and metadata.
- Known issue on Spotify 1.3.6: about 220 other classes the theme uses have no 1.3.6 name yet. Their rules do not
  apply, so parts of the glass, some colours and polish details are missing (nothing breaks; see
  docs/COMPATIBILITY.md). Spotify 1.3.4 looks the same as before.

**Tools**
- `tools/audit/selector-audit.mjs` now reads only Spotify's own files in `Apps/xpui`. Before, it also read the
  theme's installed `user.css`, so every class looked present. It also lists this Spotify's name for a renamed class
  when a class map knows it (`--map-new`).
- The class-map check (`check.mjs --map-new`) counts a scrambled name next to a readable one only when this Spotify
  has it, so a rename like 1.3.6's is caught.

## 1.0.1

A new optional Windows helper. The extension and the theme are unchanged (the extension file still says 1.0.0).

**Spotify update helper** (Windows, `extras/auto-reapply`)
- At every Windows sign-in, applies Spicetify again when Spotify has updated itself (Spotify's version is not the
  one Spicetify backed up, `xpui.spa` is back, or `index.html` no longer loads Spicetify): `spicetify backup apply` on
  a clean Spotify, `spicetify apply` on a patched one, one more try after `spicetify update`; then it opens Spotify
  again and shows a notification. Works with any Spicetify setup.
- `install.bat` copies it (and `uninstall.bat`) to `%LOCALAPPDATA%\NeonDrift` and adds a **NeonDrift Spotify** Startup
  shortcut that runs with no window (`conhost --headless`; a hidden PowerShell window on Windows older than 10 2004).
  It asks whether to open Spotify at sign-in or only fix (`.\install.bat -NoLaunch`), and recommends
  `spicetify config check_spicetify_update 0` while that is on. `uninstall.bat` removes the shortcut and, if you
  want, the files and the log. If Spotify or Spicetify is missing, it installs nothing and leaves nothing behind.
- `Open Spotify (NeonDrift).bat` runs the same check at once; `-DryRun` only reports (no log, no changes).
- Says so when Spotify or Spicetify is missing, or when Spotify is the Microsoft Store version (which Spicetify does
  not support), including when Spicetify's `spotify_path` points at it. Skips `spicetify update` when Spicetify's
  `check_spicetify_update` is 0.
- One copy at a time (a double-click during the sign-in run waits for it). Closes only this user's Spotify, started
  from the folder Spicetify patches.
- Runs only on your computer; never touches the Spotify account, settings or volume. English and Português (BR),
  following Windows' display language. Log: `%LOCALAPPDATA%\NeonDrift\startup.log`. It cannot tell an update from
  `spicetify restore`: uninstall it before going back to stock Spotify.

## 1.0.0

First public release, in two parts.

**NeonDrift Ambient** (extension)
- Ambient mode after an idle time (5 to 60 s) while music plays, "Try it now", and every way out (mouse, keys,
  menus, dialogs, typing, full screen, lyrics, cinema views).
- Visualizers *Mirrored bars*, *Neon ring* and *Wave*, with Intensity, Reach, Fall and peak caps per style.
- Kick detection on Spotify's audio analysis, look-ahead decays, "drums present?" gate, automatic visual rhythm.
- Per-element layers (bass, vocals & melody, highs & hi-hats; bass entry, snares & claps, build-ups & breakdowns;
  colour following the harmony). Beat zoom, beat glow and groove sway.
- Soft mode for tracks without an analysis.
- "Customize NeonDrift" panel (Ambient, Colors, Wallpaper) with a live preview that docks while you scroll.
- Colours: presets, a custom pair, "Match the wallpaper". Wallpaper: album cover (default), a picture from the
  computer, or the built-in neon gradient; Dim, Layout blur, Ambient mode blur.
- Works with any Spicetify theme or none; with the NeonDrift theme its colours and wallpaper style all of Spotify.
  Its own CSS is scoped to its own nodes and `!important`, so themes that style every input or every element
  (Dribbblish, Sleek, text, Onepunch, Ziro...) leave the panel and ambient mode as they are.
- Entry points: a top-bar button, two profile-menu entries; a player-bar button when the top bar has no room for one
  (decided 30 s after the window first shows Spotify, and removed if the top-bar button appears later); Ctrl+Alt+N,
  announced in a notification, when there is nothing else.
- On a new install, the first time ambient mode starts by itself it says how to go back and where the settings are.
- Português (Brasil) and English.
- One instance only, whatever the install method; everything it adds is removed when it is turned off.

**NeonDrift** (theme)
- Neon glass layout with a two-colour accent system, Encore token overrides and a wallpaper layer.
- Scrambled Spotify class names paired with their readable css-map names where one exists, so the theme looks the
  same whichever class map Spicetify downloaded at `spicetify backup`.
- A neon gradient wallpaper when the extension is not installed.
