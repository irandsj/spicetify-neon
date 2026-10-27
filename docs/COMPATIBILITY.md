# Compatibility

## Tested

| Spotify | Spicetify | OS | Result |
|---|---|---|---|
| 1.3.4.258 | 2.45.3 | Windows 11 | extension + theme, extension alone (no theme), English and Português (BR) |
| 1.3.6.1921 | 2.45.3 | Windows 11 | checked offline (against Spotify's code), NeonDrift 1.0.2: extension OK; theme partly applied, because Spotify renamed its scrambled classes (see below) |

**With other themes.** The extension's panel and ambient mode were checked offline against Spotify 1.3.4's own CSS
with the `user.css` of Dribbblish, Sleek, text, Onepunch, Ziro, BurntSienna, Flow, Default, Galaxy and Turntable
(spicetify-themes): they look the same as with no theme. Many themes style every input or every element
(`input { padding: … }`, `* { font-size: … !important }`, `* { box-shadow: none !important }`); every rule of the
extension's own CSS is `!important` and scoped to its own nodes, so those rules cannot reach the panel. The theme's
font is kept for Spotify itself; the panel keeps its own. Not yet tried inside a live Spotify with each theme.

Other versions are best effort. The extension reports what it finds with `NeonDriftAmbient.compat()` in the
DevTools console, and shows a one-time note in its panel on a Spotify version that has not been tested (with the
NeonDrift theme on) or when an API it uses is missing.

## How each part depends on Spotify

**The extension** uses Spicetify's APIs and almost none of Spotify's own page structure, so it keeps working across
updates. Every API is looked up when it is used and has a fallback:

| Needs | Fallback |
|---|---|
| `Spicetify.Player` (events, progress) | none: the extension waits for it (up to 3 minutes) |
| `Spicetify.getAudioData` | the same request through `Spicetify.CosmosAsync`, then *soft mode* (no beat) |
| `Spicetify.Topbar.Button` mounted next to "What's New" | another spot in the top bar, then a player-bar button (decided 30 s after Spotify's window first shows its page; it goes away again if the top-bar button turns up later) |
| `Spicetify.Menu.Item` (profile menu) | the buttons above; with none of them, Ctrl+Alt+N opens the panel (a notification says so) |
| `Spicetify.Locale` | the browser language, then English |

**The theme** styles Spotify's page. It prefers stable hooks (ids, `data-testid`, roles, Encore tokens). Where it has
to use Spotify's scrambled class names (tagged `1.3.4` in `user.css`), each one is paired with the readable name
Spicetify's css-map gives it, when there is one: `:is(.scrambled, .readable)`. When a Spotify update renames a class
that has no readable name yet, the rule simply stops applying:

- the content pages lose part of the glass (they show the theme's navy background; nothing breaks);
- a few small Spotify-green dots / rings come back;
- some secondary text turns grey instead of ice blue;
- small polish details are lost.

With `replace_colors 1` most of these colours are covered by Spicetify's colour scheme anyway.

**Spotify 1.3.6** renamed every scrambled class. Where Spicetify's main-branch class map already knows a class's 1.3.6
name, that name is a third arm of the same `:is()` (16 classes in NeonDrift 1.0.2). About 220 other classes the theme
uses have no 1.3.6 name yet, so on 1.3.6 the losses above apply to many pages until they are matched in a live
Spotify. The extension is not affected.

**Spicetify's class maps.** The readable names come from the class map Spicetify downloads at `spicetify backup`:
the newest map of its main branch while the latest Spicetify release shares the installed version's major.minor
number, else the map of the release tag, else the copy installed with Spicetify (also when GitHub cannot be reached).
These maps differ: on Spotify 1.3.4, the main branch's map (since October 2026) has readable names for some classes
that the tag's map leaves scrambled, such as `main-genericButton-button`, `progress-bar` or `main-actionButtons`. So
two people with the same Spotify can have different class names. Every class NeonDrift uses that only one of the
maps names is written with both names (`:is(.kqGrI_ODO1c0FGcH5yeB, .main-genericButton-button)`; in the extension,
`".main-actionButtons, .uf2x5WzM1lLLCLSQdMFB"`), so the look is the same with either map.

## After a Spotify or Spicetify update

1. Update Spicetify's patch: `spicetify backup apply` (or `spicetify restore backup apply`).
2. Open Spotify and check the top bar button, the panel and ambient mode ("Try it now").
3. Run `NeonDriftAmbient.compat()` in the DevTools console: `api` should be all `true`.
4. Look at a few pages (Home, a playlist, an artist). If the glass is gone somewhere, look for a NeonDrift update,
   or open an issue with the Spotify version.

Developers: `node tools/audit/specificity-diff.mjs old.css new.css` checks that a selector edit kept every rule's
specificity; `node tools/build/check.mjs` runs all release checks. For the class maps, download the main branch's
map (`https://raw.githubusercontent.com/spicetify/cli/main/css-map.json`) and run
`node tools/build/check.mjs --map-new <that file>` (or `node tools/audit/selector-audit.mjs --original <Spicetify
Backup/xpui.spa> --map-new <that file>`): it lists every class name that only one of the two maps (main and the local
copy) gives this Spotify and that the theme or the extension uses without this Spotify's scrambled twin.
`node tools/audit/selector-audit.mjs <Spotify Apps/xpui> theme/NeonDrift/user.css <local css-map.json> --map-new <main
css-map.json>` lists the theme's scrambled classes this Spotify no longer has and, where a map knows it, the new name.

## Spicetify 3

Spicetify 3 does not load Spicetify 2 themes (`user.css`) or extensions, and its installer removes Spicetify 2's
css-map. Keep Spicetify 2 for now (you can turn off the update prompt with
`spicetify config check_spicetify_update 0`). A Spicetify 3 version of NeonDrift is planned separately.
