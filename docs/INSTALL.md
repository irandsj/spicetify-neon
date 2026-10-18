# Installing NeonDrift

[Português](INSTALL.pt-BR.md)

NeonDrift has two parts. Install the extension alone, or the extension and the theme.

- **NeonDrift Ambient** (extension): `extension/neondrift-ambient.js`
- **NeonDrift** (theme): the folder `theme/NeonDrift` (`user.css` + `color.ini`)

You need the Spotify desktop app with [Spicetify](https://spicetify.app) **2.x** already installed
(`spicetify -v` prints the version).

### Getting Spicetify 2

Spicetify 3 does not load Spicetify 2 themes or extensions yet, so neither part of NeonDrift would show up there.
Spicetify's installer always installs the newest release unless you name a version, so name the last 2.x one:

- Windows (PowerShell):
  ```powershell
  $v="2.45.3"; iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
  ```
- Linux / macOS:
  ```sh
  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh -s -- 2.45.3
  ```

Do not run `spicetify upgrade` while you want to keep NeonDrift: it moves to the newest Spicetify (3.x once that is
the latest release). `spicetify config check_spicetify_update 0` stops the reminder, and the `spicetify update` retry
of the [Windows update helper](#keep-it-applied-after-spotify-updates-windows) too.

Spicetify's folder: `%appdata%\spicetify` on Windows, `~/.config/spicetify` on Linux and macOS
(`spicetify path userdata` prints it).

## From the Marketplace

Once NeonDrift is published: Spicetify Marketplace > search **NeonDrift**.

- The **NeonDrift** theme card installs the theme and loads the extension with it.
- The **NeonDrift Ambient** card installs only the extension (for use with any other theme).

Installing both is fine: only one copy of the extension runs.

## By hand

### The extension

1. Copy `neondrift-ambient.js` into Spicetify's `Extensions` folder.
2. Run:
   ```sh
   spicetify config extensions neondrift-ambient.js
   spicetify apply
   ```

### The theme

1. Copy the folder `theme/NeonDrift` into Spicetify's `Themes` folder, so you have `Themes/NeonDrift/user.css`
   and `Themes/NeonDrift/color.ini`.
2. Run:
   ```sh
   spicetify config current_theme NeonDrift color_scheme Neon
   spicetify apply
   ```

The theme works with `replace_colors` 0 or 1 (Spicetify's default is 1).

### Coming from an older NeonDrift theme with a `theme.js`

Older NeonDrift versions shipped the ambient mode as a `theme.js` inside the theme folder. Remove that file
(and the theme's old `assets` folder) and turn the theme script off, otherwise two copies would load:

```sh
spicetify config inject_theme_js 0
spicetify apply
```

Your settings carry over as they are (same storage, same format).

## Update

Copy the new files over the old ones and run `spicetify apply`. Marketplace installs update by themselves.

## Keep it applied after Spotify updates (Windows)

A Spotify update puts back Spotify's original files, so NeonDrift is gone until you run `spicetify backup apply`
again. The optional helper in `extras/auto-reapply` does it at every Windows sign-in (double-click `install.bat`;
`uninstall.bat`, there or in `%LOCALAPPDATA%\NeonDrift`, removes it). See
[the README](../README.md#keep-neondrift-after-spotify-updates-windows) for what it does, the fix-only option, its log
and privacy.

## Uninstall

If you installed the [Windows update helper](#keep-it-applied-after-spotify-updates-windows), run its `uninstall.bat`
first (in `%LOCALAPPDATA%\NeonDrift`) when you want stock Spotify back (`spicetify restore`) or remove Spicetify: it
cannot tell that from a Spotify update, and would apply Spicetify again at the next sign-in.

### Remove the extension

```sh
spicetify config extensions neondrift-ambient.js-
spicetify apply
```

### Remove the theme (only if NeonDrift is your current theme)

This switches Spicetify back to no theme; skip it if you use the extension with another theme.

```sh
spicetify config current_theme ""
spicetify apply
```

Then delete the files you copied.

### Clearing the saved settings

The settings and the picture you chose stay in Spotify's local storage until you clear them. To remove them,
open the DevTools console (`spicetify enable-devtools`, then Ctrl+Shift+I in Spotify) and run:

```js
localStorage.removeItem("NeonDrift:ambient:v2");
localStorage.removeItem("NeonDrift:ambient-mode");
localStorage.removeItem("NeonDrift:lang");
localStorage.removeItem("NeonDrift:compat-note");
localStorage.removeItem("NeonDrift:intro-seen");
indexedDB.deleteDatabase("NeonDrift");
```

## Options for the curious

- `localStorage.setItem("NeonDrift:lang", "en")` (or `"pt-BR"`) forces a language; remove the key to follow
  Spotify again. Reload Spotify (Ctrl+R with DevTools on, or restart it) to see the change.
- `localStorage.setItem("NeonDrift:debug", "1")` writes what the extension does to the DevTools console.
- `NeonDriftAmbient.state()`, `.compat()` and `.theme()` in the console report what it sees.
