# Changelog

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
