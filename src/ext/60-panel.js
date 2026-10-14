  // ---- settings panel ------------------------------------------------------------
  const THUMBS = {
    bars:
      '<svg viewBox="0 0 56 32" aria-hidden="true"><g stroke="url(#nd-ap-grad)" stroke-width="2.2" stroke-linecap="round">' +
      [4, 9, 14, 19, 24, 28, 32, 37, 42, 47, 52].map((x, i) => {
        const hh = [2, 4, 6, 9, 12, 14, 12, 9, 6, 4, 2][i];
        return '<line x1="' + x + '" y1="' + (16 - hh) + '" x2="' + x + '" y2="' + (16 + hh) + '"/>';
      }).join("") + "</g></svg>",
    ring:
      '<svg viewBox="0 0 56 32" aria-hidden="true"><g stroke="url(#nd-ap-grad)" stroke-width="1.8" stroke-linecap="round">' +
      Array.from({ length: 20 }, (_, k) => {
        const a = (k / 20) * TAU - Math.PI / 2, l = 3 + 4 * Math.abs(Math.cos(a));
        const x1 = 28 + Math.cos(a) * 9, y1 = 16 + Math.sin(a) * 9, x2 = 28 + Math.cos(a) * (9 + l), y2 = 16 + Math.sin(a) * (9 + l);
        return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
      }).join("") + '</g><circle cx="28" cy="16" r="6.5" fill="url(#nd-ap-grad)" opacity=".85"/></svg>',
    wave:
      '<svg viewBox="0 0 56 32" aria-hidden="true" fill="none" stroke-linecap="round">' +
      '<path d="M2 16 C 10 4, 18 4, 24 16 S 38 28, 44 16 S 52 8, 54 16" stroke="url(#nd-ap-grad)" stroke-width="2.4"/>' +
      '<path d="M2 16 C 10 28, 18 28, 24 16 S 38 4, 44 16 S 52 24, 54 16" style="stroke:var(--nda-text)" stroke-opacity=".55" stroke-width="1.4"/>' +
      '<path d="M2 16 C 12 10, 20 22, 30 15 S 46 12, 54 16" style="stroke:var(--nda-a1)" stroke-opacity=".7" stroke-width="1.2"/></svg>',
  };

  const ICON_PALETTE =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 1.25C4.27 1.25 1.25 4.03 1.25 7.6c0 3.63 3.06 7.15 6.53 7.15 1.07 0 1.72-.66 1.72-1.52 0-.42-.16-.75-.39-1.04-.2-.26-.33-.5-.33-.82 0-.6.5-1.04 1.12-1.04h1.55c2.03 0 3.3-1.4 3.3-3.33 0-3.14-2.98-5.75-6.75-5.75ZM4.6 8.6a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm1.75-3.15a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm3.4 0a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm1.9 2.9a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Z"/></svg>';
  const ICON_IMAGE =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 2.25h10c.97 0 1.75.78 1.75 1.75v8c0 .97-.78 1.75-1.75 1.75H3c-.97 0-1.75-.78-1.75-1.75V4c0-.97.78-1.75 1.75-1.75Zm0 1.5a.25.25 0 0 0-.25.25v6.44l2.72-2.72a.75.75 0 0 1 1.06 0l1.72 1.72 2.97-3.47a.75.75 0 0 1 1.14 0l.89 1.04V4a.25.25 0 0 0-.25-.25H3Zm2.6 3.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"/></svg>';
  const ICON_SPARK =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.1 1.6a.5.5 0 0 1 .94 0l.9 2.5a2.5 2.5 0 0 0 1.5 1.5l2.5.9a.5.5 0 0 1 0 .94l-2.5.9a2.5 2.5 0 0 0-1.5 1.5l-.9 2.5a.5.5 0 0 1-.94 0l-.9-2.5a2.5 2.5 0 0 0-1.5-1.5l-2.5-.9a.5.5 0 0 1 0-.94l2.5-.9a2.5 2.5 0 0 0 1.5-1.5l.9-2.5Zm5.6 8.7a.35.35 0 0 1 .66 0l.35 1a1 1 0 0 0 .6.6l1 .35a.35.35 0 0 1 0 .66l-1 .35a1 1 0 0 0-.6.6l-.35 1a.35.35 0 0 1-.66 0l-.35-1a1 1 0 0 0-.6-.6l-1-.35a.35.35 0 0 1 0-.66l1-.35a1 1 0 0 0 .6-.6l.35-1Z"/></svg>';
  const ICON_SWAP =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.47 1.97a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 1 1-1.06-1.06l1.22-1.22H2.75a.75.75 0 0 1 0-1.5h9.94l-1.22-1.22a.75.75 0 0 1 0-1.06Zm-6.94 6a.75.75 0 0 1 0 1.06L3.31 10.25h9.94a.75.75 0 0 1 0 1.5H3.31l1.22 1.22a.75.75 0 1 1-1.06 1.06l-2.5-2.5a.75.75 0 0 1 0-1.06l2.5-2.5a.75.75 0 0 1 1.06 0Z"/></svg>';
  const ICON_PLUS =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 2.25a.75.75 0 0 1 .75.75v4.25H13a.75.75 0 0 1 0 1.5H8.75V13a.75.75 0 0 1-1.5 0V8.75H3a.75.75 0 0 1 0-1.5h4.25V3A.75.75 0 0 1 8 2.25Z"/></svg>';
  const ICON_DISC =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 1.25a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5Zm0 4.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm0 1.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/></svg>';
  const ICON_CHECK =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.53 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.97 2.97 5.97-5.97a.75.75 0 0 1 1.06 0Z"/></svg>';
  const ICON_PENCIL =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.6 1.9a1.75 1.75 0 0 1 2.47 0l.03.03a1.75 1.75 0 0 1 0 2.47L6.2 12.3a2 2 0 0 1-.9.52l-2.84.77a.5.5 0 0 1-.61-.61l.77-2.84a2 2 0 0 1 .52-.9L11.6 1.9Z"/></svg>';
  const TABS = [
    { id: "amb", icon: ICON_EQ },          // "Ambiente"
    { id: "colors", icon: ICON_PALETTE },  // "Cores"
    { id: "wall", icon: ICON_IMAGE },      // "Wallpaper"
  ].map((x) => named("tab.", x));
  const TAB_IDS = TABS.map((x) => x.id);
  const WALL_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
  /** text for innerHTML (the dictionaries hold plain text) */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tx = (key, p) => esc(tr(key, p));

  function panelHtml() {
    const range = (ref, label) =>
      '<input type="range" class="nd-ap__slider" min="0" max="' + INT_MAX + '" step="5" data-ref="' + ref + '" aria-label="' + label + '">';
    const cards = STYLES.map((s) =>
      '<div class="nd-ap__card" data-style="' + s.id + '">' +
        '<label class="nd-ap__pick"><input type="radio" class="nd-ap__radio" name="nd-ap-style" value="' + s.id + '">' +
        '<span class="nd-ap__thumb">' + THUMBS[s.id] + '<span class="nd-ap__active" aria-hidden="true">' + tx("style.active") + '</span></span><span class="nd-ap__name">' + esc(s.name) + '</span></label>' +
      "</div>").join("");
    // the selected style's own settings, in a box hanging from its card
    const srow = (ref, name, min, max, step, lo, hi) =>
      '<div class="nd-ap__srow"><span class="nd-ap__rlabel" id="nd-ap-l-' + ref + '">' + name + "</span>" +
        '<input type="range" class="nd-ap__slider" min="' + min + '" max="' + max + '" step="' + step + '" data-ref="' + ref + '" aria-labelledby="nd-ap-l-' + ref + '">' +
        '<output class="nd-ap__val" data-ref="' + ref + 'v"></output>' +
        (lo ? '<span class="nd-ap__ends" aria-hidden="true"><span>' + lo + "</span><span>" + hi + "</span></span>" : "") + "</div>";
    const styleBox =
      '<div class="nd-ap__stylebox" data-ref="styleBox" role="group" aria-labelledby="nd-ap-sb-name">' +
        '<div class="nd-ap__sbhead"><span class="nd-ap__sbname" id="nd-ap-sb-name" data-ref="sbName"></span>' +
          '<span class="nd-ap__sbright"><span class="nd-ap__sbtag">' + tx("sb.tag") + '</span>' +
          '<button type="button" class="nd-ap__sbreset" data-ref="sbReset">' + tx("btn.resetShort") + '</button></span></div>' +
        srow("sInt", tx("ctl.intensity"), 0, INT_MAX, 5, "", "") +
        srow("sReach", tx("ctl.reach"), REACH_MIN, REACH_MAX, 5, tx("ctl.reach.lo"), tx("ctl.reach.hi")) +
        srow("sFall", tx("ctl.fall"), 0, FALL_STEPS.length - 1, 1, tx("ctl.fall.lo"), tx("ctl.fall.hi")) +
        '<label class="nd-ap__srow nd-ap__srow--caps" data-ref="capsRow"><span class="nd-ap__rlabel" id="nd-ap-l-caps">' + tx("ctl.caps") + '</span>' +
          '<span class="nd-ap__capshint">' + tx("ctl.caps.hint") + '</span>' +
          '<input type="checkbox" role="switch" class="nd-ap__switch" data-ref="sCaps" aria-labelledby="nd-ap-l-caps"></label>' +
        '<span class="nd-ap__hint" data-ref="sbHint"></span>' +
        '<span class="nd-ap__sblegend" data-ref="sbLegend"></span>' +
      "</div>";
    // "Camadas por elemento": a toggle + the same 0-500 % slider per row ("Camadas" breathe with the music,
    // "Reações" happen now and then); the hints of the camadas follow the selected style (syncElBox)
    const elRow = (id, name) =>
      '<div class="nd-ap__elrow" data-el="' + id + '">' +
        '<label class="nd-ap__row nd-ap__elhead"><span class="nd-ap__rowtext"><span class="nd-ap__ellabel" id="nd-ap-el-' + id + '">' + name + "</span>" +
          '<span class="nd-ap__hint" data-ref="el-' + id + '-hint"></span></span>' +
          '<input type="checkbox" role="switch" class="nd-ap__switch nd-ap__switch--sm" data-ref="el-' + id + '-on" aria-labelledby="nd-ap-el-' + id + '"></label>' +
        '<div class="nd-ap__range nd-ap__range--row nd-ap__range--el"><span class="nd-ap__rlabel" aria-hidden="true">' + tx("ctl.intensity") + '</span>' +
          '<input type="range" class="nd-ap__slider" min="0" max="' + INT_MAX + '" step="5" data-ref="el-' + id + '-amt" aria-label="' + tx("aria.elIntensity", { name: tr("el." + id) }) + '">' +
          '<output class="nd-ap__val" data-ref="el-' + id + '-val"></output></div>' +
      "</div>";
    // the master row, the reduced-motion notice and the style legend stay in view; the six rows and the hue switch
    // sit behind a closed-by-default "Ajustar cada camada" (so "Ritmo do visual" / "Entrar após" stay above the sticky
    // footer). "Padrão" belongs to the whole box.
    const elBoxHtml =
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-el">' + tx("el.h") + '</h3>' +
      '<div class="nd-ap__fx nd-ap__elbox" data-ref="elBox" role="group" aria-labelledby="nd-ap-h-el">' +
        '<label class="nd-ap__row"><span class="nd-ap__rowtext"><span class="nd-ap__label" id="nd-ap-el-master">' + tx("el.master") + '</span>' +
          '<span class="nd-ap__hint">' + tx("el.master.hint") + '</span></span>' +
          '<input type="checkbox" role="switch" class="nd-ap__switch" data-ref="el-on" aria-labelledby="nd-ap-el-master"></label>' +
        '<span class="nd-ap__hint nd-ap__hint--warn" data-ref="el-rm" hidden>' + tx("el.rm", { os: osName() }) + '</span>' +
        '<div class="nd-ap__elbar"><button type="button" class="nd-ap__elmore" data-ref="elMore" aria-expanded="false" aria-controls="nd-ap-elbody">' +
          '<span data-ref="elMoreTxt">' + tx("el.more.open") + '</span><span class="nd-ap__elchev" aria-hidden="true"></span></button>' +
          '<button type="button" class="nd-ap__sbreset" data-ref="elReset">' + tx("btn.resetShort") + '</button></div>' +
        '<div class="nd-ap__elbody" id="nd-ap-elbody" data-ref="elBody" hidden>' +
          '<div class="nd-ap__elsub"><span class="nd-ap__elsubname">' + tx("el.sub.always") + '</span><span class="nd-ap__elsubtag">' + tx("el.sub.always.tag") + '</span></div>' +
          elRow("low", tx("el.low")) + elRow("voice", tx("el.voice")) + elRow("air", tx("el.air")) +
          '<div class="nd-ap__elsub"><span class="nd-ap__elsubname">' + tx("el.sub.sometimes") + '</span><span class="nd-ap__elsubtag">' + tx("el.sub.sometimes.tag") + '</span></div>' +
          elRow("entry", tx("el.entry")) + elRow("snare", tx("el.snare")) + elRow("mood", tx("el.mood")) +
          '<label class="nd-ap__row nd-ap__elhue" data-ref="elHueRow"><span class="nd-ap__rowtext"><span class="nd-ap__ellabel" id="nd-ap-el-hue">' + tx("el.hue") + '</span>' +
            '<span class="nd-ap__hint" data-ref="el-hue-hint"></span></span>' +
            '<input type="checkbox" role="switch" class="nd-ap__switch nd-ap__switch--sm" data-ref="el-hue" aria-labelledby="nd-ap-el-hue"></label>' +
        "</div>" +
      "</div></div>";
    const fx = (id, name, hint) =>
      '<div class="nd-ap__fx" data-fx="' + id + '">' +
        '<label class="nd-ap__row"><span class="nd-ap__rowtext"><span class="nd-ap__label">' + name + '</span><span class="nd-ap__hint" data-ref="' + id + '-hint">' + hint + '</span></span>' +
        '<input type="checkbox" role="switch" class="nd-ap__switch" data-ref="' + id + '-on"></label>' +
        '<div class="nd-ap__range nd-ap__range--row"><span class="nd-ap__rlabel">' + tx("ctl.intensity") + '</span>' + range(id + "-amt", tx("aria.fxIntensity", { name: tr("fx." + id) })) +
        '<output class="nd-ap__val" data-ref="' + id + '-val"></output></div>' +
      "</div>";
    const tabs =
      '<div class="nd-ap__tabs" role="tablist" aria-label="' + tx("aria.tabs") + '">' +
      TABS.map((x) =>
        '<button type="button" role="tab" class="nd-ap__tab" id="nd-ap-tab-' + x.id + '" data-tab="' + x.id + '" aria-controls="nd-ap-pane-' + x.id + '" aria-selected="false" tabindex="-1">' +
        x.icon + "<span>" + esc(x.name) + "</span></button>").join("") +
      "</div>";
    const pane = (id, html) =>
      '<div class="nd-ap__body" role="tabpanel" id="nd-ap-pane-' + id + '" aria-labelledby="nd-ap-tab-' + id + '" data-pane="' + id + '"' + (id === "amb" ? "" : " hidden") + ">" + html + "</div>";
    // the docked mini preview sits first in the pane (sticky, no height of its own); the preview gets the highlight
    // chip and the soft mode's note
    const amb =
      '<div class="nd-ap__dockwrap" data-ref="dockWrap"><div class="nd-ap__dock" data-ref="dock" aria-hidden="true" title="' + tx("dock.title") + '">' +
        '<canvas data-ref="dockCv" aria-hidden="true"></canvas><span class="nd-ap__chip nd-ap__chip--dock" data-ref="dockChip"></span></div></div>' +
      '<label class="nd-ap__row nd-ap__master"><span class="nd-ap__rowtext"><span class="nd-ap__label">' + tx("amb.master") + '</span>' +
      '<span class="nd-ap__hint" data-ref="masterHint"></span></span><input type="checkbox" role="switch" class="nd-ap__switch" data-ref="enabled"></label>' +
      '<div class="nd-ap__preview" data-ref="pvBox"><canvas data-ref="preview" aria-hidden="true"></canvas><span class="nd-ap__badge" data-ref="badge">' + tx("pv.badge.live") + '</span>' +
        '<span class="nd-ap__chip" data-ref="pvChip"></span><span class="nd-ap__pvnote" data-ref="pvNote">' + tx(SOFT_NOTE) + "</span></div>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-viz">' + tx("amb.h.viz") + '</h3>' +
      '<div class="nd-ap__styles" role="radiogroup" aria-labelledby="nd-ap-h-viz">' + cards + "</div>" + styleBox + "</div>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h">' + tx("fx.h") + '</h3>' +
      fx("zoom", tx("fx.zoom"), tx("fx.zoom.hint")) +
      fx("glow", tx("fx.glow"), tx("fx.glow.hint")) +
      fx("groove", tx("fx.groove"), tx("fx.groove.hint")) + "</div>" +
      elBoxHtml +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-rhythm">' + tx("rhythm.h") + '</h3>' +
      '<div class="nd-ap__fx nd-ap__rhythm">' +
        '<div class="nd-ap__seg nd-ap__seg--wide" role="radiogroup" aria-labelledby="nd-ap-h-rhythm">' +
        RHYTHM_OPTS.map((o) => '<label class="nd-ap__segopt"><input type="radio" name="nd-ap-rhythm" value="' + o.id + '"><span>' + esc(o.name) + "</span></label>").join("") +
        "</div>" +
        '<span class="nd-ap__hint" data-ref="rhythmHint"></span>' +
      "</div></div>" +
      '<div class="nd-ap__section nd-ap__section--inline"><h3 class="nd-ap__h" id="nd-ap-h-idle">' + tx("idle.h") + '</h3>' +
      '<div class="nd-ap__seg" role="radiogroup" aria-labelledby="nd-ap-h-idle">' +
      IDLE_CHOICES.map((s) => '<label class="nd-ap__segopt"><input type="radio" name="nd-ap-idle" value="' + s + '"><span>' + tx("idle.opt", { n: s }) + "</span></label>").join("") +
      "</div></div>" +
      '<div class="nd-ap__sticky"><div class="nd-ap__actions"><button type="button" class="nd-ap__btn nd-ap__btn--primary" data-ref="test">' + tx("amb.test") + '</button>' +
      '<button type="button" class="nd-ap__btn" data-ref="reset" title="' + tx("amb.reset.title") + '">' + tx("amb.reset") + '</button></div>' +
      '<p class="nd-ap__foot">' + tx("amb.foot") + '</p></div>';
    return (
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="nd-ap-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="56" y2="32">' +
      '<stop offset="0" style="stop-color:var(--nda-a1)"/><stop offset="1" style="stop-color:var(--nda-a2)"/></linearGradient></defs></svg>' +
      '<div class="nd-ap__head"><span class="nd-ap__logo">' + ICON_SPARK + '</span><h2 class="nd-ap__title" id="nd-ap-title">' + tx(PANEL_LABEL) + "</h2>" +
      '<button type="button" class="nd-ap__close" data-ref="close" aria-label="' + tx("aria.close") + '">' + ICON_X + "</button></div>" +
      tabs +
      '<div class="nd-ap__compat" data-ref="compatBox" hidden><span class="nd-ap__hint" data-ref="compatTxt"></span>' +
        '<button type="button" class="nd-ap__btn nd-ap__btn--small" data-ref="compatOk">' + tx("compat.ok") + "</button></div>" +
      pane("amb", amb) + pane("colors", colorsHtml()) + pane("wall", wallHtml())
    );
  }

  /** "Cores": presets, "Personalizado" (two colours, HSV + hex), "Combinar com o wallpaper" */
  function colorsHtml() {
    const pal = (id, name, a1, a2, extra) =>
      '<label class="nd-ap__opt nd-ap__pal" data-pal="' + id + '"' + (a1 ? ' style="--c1:' + a1 + ";--c2:" + a2 + '"' : "") + ">" +
        '<input type="radio" class="nd-ap__radio" name="nd-ap-pal" value="' + id + '">' +
        '<span class="nd-ap__sw" aria-hidden="true">' + (extra || "") + '<span class="nd-ap__check">' + ICON_CHECK + "</span></span>" +
        '<span class="nd-ap__pname">' + name + "</span></label>";
    const chip = (i) =>
      '<button type="button" class="nd-ap__cchip" data-ref="c' + i + '" aria-pressed="' + (i === 0) + '">' +
        '<span class="nd-ap__cdot" data-ref="c' + i + 'dot" aria-hidden="true"></span>' +
        '<span class="nd-ap__ctext"><span class="nd-ap__clabel">' + tx("col.chip", { n: i + 1 }) + '</span><span class="nd-ap__chex" data-ref="c' + i + 'hex"></span></span></button>';
    const hsv = (k, name, max, unit) =>
      '<div class="nd-ap__range nd-ap__range--row nd-ap__hsv"><span class="nd-ap__rlabel">' + name + "</span>" +
        '<input type="range" class="nd-ap__slider nd-ap__slider--paint" min="0" max="' + max + '" step="1" data-ref="hsv-' + k + '" aria-label="' + name + '">' +
        '<output class="nd-ap__val" data-ref="hsv-' + k + 'v"></output></div>';
    return (
      '<p class="nd-ap__hint nd-ap__hint--warn nd-ap__notheme" data-ref="colorsNoTheme" hidden>' + tx("colors.note.noTheme") + "</p>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-pal">' + tx("col.h") + '</h3>' +
      '<div class="nd-ap__pals" role="radiogroup" aria-labelledby="nd-ap-h-pal">' +
        PRESETS.map((p) => pal(p.id, esc(p.name), p.a1, p.a2, p.id === "neon" ? '<span class="nd-ap__swtag">' + tx("col.original") + '</span>' : "")).join("") +
        pal("custom", tx("col.custom"), "", "", '<span class="nd-ap__pen">' + ICON_PENCIL + "</span>") +
      "</div></div>" +
      '<div class="nd-ap__fx nd-ap__custom" data-ref="customBox" hidden>' +
        '<div class="nd-ap__cpair">' + chip(0) +
          '<button type="button" class="nd-ap__iconbtn" data-ref="swap" aria-label="' + tx("col.swap.aria") + '" title="' + tx("col.swap.title") + '">' + ICON_SWAP + "</button>" +
          chip(1) + "</div>" +
        '<div class="nd-ap__gradbar" data-ref="gradBar" aria-hidden="true"></div>' +
        hsv("h", tx("col.hue"), 360, "°") + hsv("s", tx("col.sat"), 100, "%") + hsv("v", tx("col.val"), 100, "%") +
        '<div class="nd-ap__hexrow"><span class="nd-ap__rlabel">' + tx("col.code") + '</span>' +
          '<input type="text" class="nd-ap__hexin" data-ref="hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="' + tx("col.code.aria") + '">' +
          '<span class="nd-ap__hint" data-ref="cWarn"></span></div>' +
      "</div>" +
      '<button type="button" class="nd-ap__opt nd-ap__match" data-ref="match" aria-pressed="false">' +
        '<span class="nd-ap__matchicon" aria-hidden="true">' + ICON_SPARK + "</span>" +
        '<span class="nd-ap__rowtext"><span class="nd-ap__label">' + tx("col.match") + '</span><span class="nd-ap__hint" data-ref="matchHint"></span></span>' +
        '<span class="nd-ap__sw nd-ap__sw--sm" data-ref="matchSw" aria-hidden="true"></span></button>' +
      '<p class="nd-ap__foot" data-ref="colorsFoot">' + tx("col.foot") + '</p>' +
      '<div class="nd-ap__actions"><button type="button" class="nd-ap__btn" data-ref="resetColors">' + tx("amb.reset") + '</button></div>'
    );
  }

  /** "Wallpaper": the three sources with thumbnails, the file box, "Escurecer" / "Desfoque" */
  function wallHtml() {
    const opt = (id, name, ph) =>
      '<label class="nd-ap__opt nd-ap__wopt" data-wall="' + id + '"><input type="radio" class="nd-ap__radio" name="nd-ap-wall" value="' + id + '">' +
        '<span class="nd-ap__wthumb" data-ref="wthumb-' + id + '" aria-hidden="true">' + (ph ? '<span class="nd-ap__wph">' + ph + "</span>" : "") +
        '<span class="nd-ap__check">' + ICON_CHECK + "</span></span>" +
        '<span class="nd-ap__pname">' + name + "</span></label>";
    const slider = (ref, name, max, step) =>
      '<div class="nd-ap__range nd-ap__range--row nd-ap__range--wall" data-ref="' + ref + 'Row"><span class="nd-ap__rlabel">' + name + "</span>" +
        '<input type="range" class="nd-ap__slider" min="0" max="' + max + '" step="' + step + '" data-ref="' + ref + '" aria-label="' + name + '">' +
        '<output class="nd-ap__val" data-ref="' + ref + 'v"></output></div>';
    return (
      '<p class="nd-ap__hint nd-ap__hint--warn nd-ap__notheme" data-ref="wallNoTheme" hidden>' + tx("wall.note.noTheme") + "</p>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-wall">' + tx("wall.h") + '</h3>' +
      '<div class="nd-ap__walls" role="radiogroup" aria-labelledby="nd-ap-h-wall">' +
        opt("default", tx("wall.opt.default")) + opt("file", tx("wall.opt.file"), ICON_PLUS) + opt("cover", tx("wall.opt.cover"), ICON_DISC) +
      "</div>" +
      '<p class="nd-ap__whint" data-ref="wallHint"></p></div>' +
      '<div class="nd-ap__fx nd-ap__filebox">' +
        '<div class="nd-ap__rowtext"><span class="nd-ap__label">' + tx("wall.opt.file") + '</span><span class="nd-ap__hint" data-ref="fileInfo"></span></div>' +
        '<div class="nd-ap__btnrow"><button type="button" class="nd-ap__btn nd-ap__btn--small" data-ref="pick">' + tx("wall.pick") + '</button>' +
        '<button type="button" class="nd-ap__btn nd-ap__btn--small" data-ref="removeFile">' + tx("wall.remove") + '</button></div>' +
        '<input type="file" class="nd-ap__file" data-ref="file" accept="' + WALL_ACCEPT + '" tabindex="-1" aria-hidden="true" hidden>' +
        '<p class="nd-ap__note" data-ref="wallNote" hidden></p>' +
      "</div>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h">' + tx("wall.adj.h") + '</h3><div class="nd-ap__fx">' +
        slider("dim", tx("wall.dim"), 80, 5) + slider("layoutBlur", tx("wall.layoutBlur"), BLUR_MAX, 1) + slider("ambBlur", tx("wall.ambBlur"), BLUR_MAX, 1) +
        // what "Desfoque no modo ambiente" does, at its real size (the overlay is hidden while the panel is open)
        '<div class="nd-ap__ambpv"><canvas data-ref="ambPv" aria-hidden="true"></canvas><span class="nd-ap__badge">' + tx("wall.ambPv.badge") + '</span>' +
          '<button type="button" class="nd-ap__btn nd-ap__btn--small nd-ap__ambtest" data-ref="ambTest">' + tx("wall.ambTest") + '</button></div>' +
        '<span class="nd-ap__hint" data-ref="blurHint"></span>' +
      "</div></div>" +
      '<div class="nd-ap__actions"><button type="button" class="nd-ap__btn" data-ref="resetWall" title="' + tx("wall.reset.title") + '">' + tx("amb.reset") + '</button></div>'
    );
  }

  function buildPanel() {
    if (el.panel) return;
    const p = document.createElement("div");
    p.id = "nd-amb-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "false");
    p.setAttribute("aria-labelledby", "nd-ap-title");
    p.setAttribute("lang", LANG);
    p.setAttribute("dir", "ltr");          // only LTR languages ship; don't inherit Spotify's dir="rtl"
    p.tabIndex = -1;
    p.hidden = true;
    p.innerHTML = panelHtml();
    el.panel = p;
    el.pRef = {};
    for (const n of p.querySelectorAll("[data-ref]")) el.pRef[n.getAttribute("data-ref")] = n;
    el.pBadge = el.pRef.badge;
    V.preview = makeView(el.pRef.preview, "preview");
    // the docked mini preview: watch the pane's scroll; a click on the mini preview goes back up; a control that
    // takes the focus under it scrolls into view below it
    const pane = el.pRef.dockWrap.parentNode;
    el.pane = pane;
    el.dockCtx = el.pRef.dockCv.getContext("2d");
    pane.addEventListener("scroll", scheduleDock, { passive: true });
    pane.addEventListener("focusin", onPaneFocus);
    el.pRef.dock.addEventListener("click", (e) => {
      e.preventDefault();
      try { pane.scrollTo({ top: 0, behavior: S.reducedMotion ? "auto" : "smooth" }); } catch (err) { pane.scrollTop = 0; }
    });
    p.addEventListener("input", onPanelInput);
    p.addEventListener("change", onPanelChange);
    p.addEventListener("click", onPanelClick);
    el.pRef.file.addEventListener("cancel", () => { S.filePicking = false; syncLook(); });
    document.body.appendChild(p);
    setTab(S.tab || "amb", false);
    syncPanel();
  }

  /** the language changed after the panel was built (a late Spicetify.Locale): the same panel again, in the new
      language, on the same tab, open if it was open */
  function rebuildPanel() {
    if (!el.panel) return;
    const open = S.panelOpen, tab = S.tab;
    disarm();
    if (S.dockRaf) { cancelAnimationFrame(S.dockRaf); S.dockRaf = 0; }
    S.docked = false;
    WP.noteText = "";                             // a transient note, in the old language
    el.panel.remove();
    el.panel = null;
    el.pRef = null;
    el.pane = null;
    buildPanel();
    setTab(tab, false);
    if (open) {
      el.panel.hidden = false;
      el.panel.classList.add("nd-ap--open");
      positionPanel();
      syncLook();
    }
  }

  /** shows one tab (roving tabindex; the live preview only draws on "Ambiente") */
  function setTab(id, focus) {
    if (!el.panel || !TAB_IDS.includes(id)) return;
    if (S.tab !== id) disarm();
    S.tab = id;
    for (const b of el.panel.querySelectorAll(".nd-ap__tab")) {
      const on = b.dataset.tab === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    for (const pn of el.panel.querySelectorAll(".nd-ap__body")) pn.hidden = pn.dataset.pane !== id;
    if (id === "wall" && CFG.wallpaper.file && !WP.fileUrl) loadFileWall().then(syncLook, () => {});
    syncLook();
    if (S.panelOpen) positionPanel();
    if (id === "wall") requestAnimationFrame(paintAmbPreview);   // after the pane has its size
    scheduleDock();                               // the dock belongs to "Ambiente"
  }

  function syncPanel() {
    if (!el.panel) return;
    const R = el.pRef, p = el.panel;
    R.enabled.checked = CFG.enabled;
    R.masterHint.textContent = CFG.enabled ? tr("amb.masterHint.on", { n: CFG.idleSec }) : tr("amb.masterHint.off");
    STYLES.forEach((s, k) => {
      const card = p.querySelector('.nd-ap__card[data-style="' + s.id + '"]');
      const sel = CFG.style === s.id;
      card.classList.toggle("nd-ap__card--on", sel);
      card.querySelector(".nd-ap__radio").checked = sel;
      if (sel) R.styleBox.style.setProperty("--nda-sb-x", ((k * 2 + 1) / (STYLES.length * 2)) * 100 + "%");
    });
    syncStyleBox();
    for (const k of ["zoom", "glow", "groove"]) {
      R[k + "-on"].checked = CFG[k].on;
      setRange(R[k + "-amt"], R[k + "-val"], CFG[k].amount);
      R[k + "-amt"].disabled = !CFG[k].on;
      p.querySelector('.nd-ap__fx[data-fx="' + k + '"]').classList.toggle("nd-ap__fx--off", !CFG[k].on);
    }
    // the zoom and the groove are motion: paused while Windows asks for less animation
    const RM_HINT = tr("rm.hint", { os: osName() });
    for (const [k, hint] of [["zoom", tr("fx.zoom.hint")], ["groove", tr("fx.groove.hint")]]) {
      const rm = S.reducedMotion && CFG[k].on;
      R[k + "-hint"].textContent = rm ? RM_HINT : hint;
      R[k + "-hint"].classList.toggle("nd-ap__hint--warn", rm);
    }
    for (const r of p.querySelectorAll('input[name="nd-ap-idle"]')) r.checked = Number(r.value) === CFG.idleSec;
    for (const r of p.querySelectorAll('input[name="nd-ap-rhythm"]')) r.checked = r.value === CFG.rhythm;
    syncElBox();
    syncRhythm();
    syncLook();
    syncCompat();
  }
  /** the one-time note on an untested Spotify version / a missing API (dismissed per Spotify version) */
  function syncCompat() {
    const R = el.pRef;
    if (!R || !R.compatBox) return;
    const n = S.compatNote === undefined ? (S.compatNote = compatNoteWanted()) : S.compatNote;
    R.compatBox.hidden = !n;
    if (n) R.compatTxt.textContent = n.why === "api" ? tr("compat.note.api") : tr("compat.note", { v: n.v });
  }
  /** "Camadas por elemento": what each camada lights up in the selected style (i18n keys); the reações are the same in all */
  const EL_HINTS = {
    low: { ring: "el.hint.low.ring", bars: "el.hint.low.bars", wave: "el.hint.low.wave" },
    voice: { ring: "el.hint.voice.ring", bars: "el.hint.voice.bars", wave: "el.hint.voice.wave" },
    air: { ring: "el.hint.air.ring", bars: "el.hint.air.bars", wave: "el.hint.air.wave" },
    entry: "el.hint.entry",
    snare: "el.hint.snare",
    mood: "el.hint.mood",
    hue: { ring: "el.hint.hue.ring", bars: "el.hint.hue.bars", wave: "el.hint.hue.wave" },
  };
  /** what the reações do while the system asks for less motion (nothing travels, contracts or orbits) */
  const EL_HINTS_RM = {
    entry: "el.hintRM.entry",
    mood: "el.hintRM.mood",
  };
  function syncElBox() {
    const R = el.pRef, box = R && R.elBox, Lc = CFG.layers;
    if (!box || !Lc) return;
    R["el-on"].checked = Lc.on;
    box.classList.toggle("nd-ap__elbox--off", !Lc.on);
    // the rows sit behind "Ajustar cada camada" (closed by default; stays open for this session once opened)
    const open = !!S.elOpen;
    R.elBody.hidden = !open;
    R.elMore.setAttribute("aria-expanded", String(open));
    R.elMore.classList.toggle("nd-ap__elmore--open", open);
    R.elMoreTxt.textContent = tr(open ? "el.more.close" : "el.more.open");
    for (const id of EL_IDS) {
      const o = Lc[id], row = box.querySelector('.nd-ap__elrow[data-el="' + id + '"]'), h = (S.reducedMotion && EL_HINTS_RM[id]) || EL_HINTS[id];
      R["el-" + id + "-on"].checked = o.on;
      setRange(R["el-" + id + "-amt"], R["el-" + id + "-val"], o.amount);
      // with the master off nothing in the rows can be changed (like an effect that is off in "Efeitos")
      R["el-" + id + "-on"].disabled = !Lc.on;
      R["el-" + id + "-amt"].disabled = !o.on || !Lc.on;
      row.classList.toggle("nd-ap__elrow--off", !o.on);
      const txt = tr(typeof h === "string" ? h : h[CFG.style] || h.ring);
      if (R["el-" + id + "-hint"].textContent !== txt) R["el-" + id + "-hint"].textContent = txt;
    }
    R["el-hue"].checked = Lc.hue;
    R["el-hue"].disabled = !Lc.on;
    // the hint names the style's own voice element; in "Anel neon" / "Barras" the hue needs "Voz e melodia"
    const noVoice = CFG.style !== "wave" && !Lc.voice.on, hueTxt = tr(EL_HINTS.hue[CFG.style] || EL_HINTS.hue.ring) + (noVoice ? tr("el.hint.hue.needsVoice") : "");
    if (R["el-hue-hint"].textContent !== hueTxt) R["el-hue-hint"].textContent = hueTxt;
    R.elHueRow.classList.toggle("nd-ap__elrow--off", noVoice);
    R["el-rm"].hidden = !(S.reducedMotion && Lc.on);     // the system asks for less motion: no orbit / creep / travel
    const d = JSON.stringify(Lc) === JSON.stringify(DEFAULTS.layers);
    R.elReset.disabled = d;
    R.elReset.title = tr(d ? "el.reset.isDefault" : "el.reset.title");
  }
  /** "Ritmo do visual": what "Automático" picked for the song that is playing */
  function syncRhythm() {
    if (!el.pRef || !el.pRef.rhythmHint) return;
    const item = currentItem(), A = analysisFor(item && item.uri);
    const four = A ? A.four : null, mode = CFG.rhythm;
    let txt;
    if (mode === "beat") txt = tr("rhythm.hint.beat");
    else if (mode === "bass") txt = tr("rhythm.hint.bass");
    else txt = tr(four == null ? "rhythm.hint.auto" : four >= 0.5 ? "rhythm.hint.autoFour" : "rhythm.hint.autoBass");
    if (el.pRef.rhythmHint.textContent !== txt) el.pRef.rhythmHint.textContent = txt;
    el.pRef.rhythmHint.dataset.four = four == null ? "" : String(four);
  }
  function setRange(input, out, v) {
    if (Number(input.value) !== v) input.value = String(v);
    input.style.setProperty("--nda-fill", (v / INT_MAX) * 100 + "%");
    input.setAttribute("aria-valuetext", v + "%");
    out.textContent = v + PCT;
  }
  /** "0,7 s" (pt-BR decimal comma) / "0.7 s" */
  const fmtSec = (ms) => dec(+(ms / 1000).toFixed(2)) + " s";
  const fallWord = (ms) => tr(ms <= 150 ? "fallWord.fast" : ms <= 450 ? "fallWord.medium" : ms <= 1100 ? "fallWord.slow" : "fallWord.vslow");
  /** past 200 % "Intensidade" mostly grows the beat (the in-between keeps its 200 % level), so the hint says so,
      and what to do about it depends on where "Alcance" already is */
  function sbHintOf(id) {
    const base = STYLE_IDS.includes(id) ? tr("sb.hint." + id) : "", it = num(CFG.intensity && CFG.intensity[id], 130), rc = num(CFG.reach && CFG.reach[id], 60);
    if (it <= 200) return base;
    return base + tr("sb.hint.over200") + tr(rc >= REACH_MAX ? "sb.hint.over200.maxReach" : "sb.hint.over200.raiseReach");
  }
  /** the box under the cards: the selected style's Intensidade / Alcance / Volta */
  function syncStyleBox() {
    const R = el.pRef, id = CFG.style, st = STYLES.find((x) => x.id === id);
    R.sbName.textContent = st ? st.name : "";
    setRange(R.sInt, R.sIntv, CFG.intensity[id]);
    const rc = CFG.reach[id];
    if (Number(R.sReach.value) !== rc) R.sReach.value = String(rc);
    R.sReach.style.setProperty("--nda-fill", ((rc - REACH_MIN) / (REACH_MAX - REACH_MIN)) * 100 + "%");
    R.sReach.setAttribute("aria-valuetext", tr("aria.reach", { n: rc }));
    R.sReachv.textContent = rc + PCT;
    const fl = CFG.fall[id];
    if (fallFromPos(Number(R.sFall.value)) !== fl) R.sFall.value = String(fallToPos(fl));
    R.sFall.style.setProperty("--nda-fill", (Number(R.sFall.value) / (FALL_STEPS.length - 1)) * 100 + "%");
    R.sFall.setAttribute("aria-valuetext", tr("aria.fall", { n: fl / 1000, s: dec(+(fl / 1000).toFixed(2)), word: fallWord(fl) }));
    R.sFallv.textContent = fmtSec(fl);
    R.sFallv.title = tr("title.fall", { word: fallWord(fl) });
    R.sbHint.textContent = sbHintOf(id);
    // which part shows which element (only with "Camadas por elemento" on)
    R.sbLegend.textContent = CFG.layers && CFG.layers.on && STYLE_IDS.includes(id) ? tr("sb.legend." + id) : "";
    R.sbLegend.hidden = !(CFG.layers && CFG.layers.on);
    const hasCaps = id in DEFAULTS.caps;                 // "Onda" has no peak caps
    R.capsRow.hidden = !hasCaps;
    R.sCaps.checked = hasCaps && CFG.caps[id] !== false;
    const d = CFG.intensity[id] === DEFAULTS.intensity[id] && CFG.reach[id] === DEFAULTS.reach[id] && CFG.fall[id] === DEFAULTS.fall[id] && (!hasCaps || CFG.caps[id] === DEFAULTS.caps[id]);
    R.sbReset.disabled = d;
    R.sbReset.title = tr(d ? "sb.reset.isDefault" : "sb.reset.title");
  }
  function setRangeU(input, out, v, max, unit) {
    if (Number(input.value) !== v) input.value = String(v);
    input.style.setProperty("--nda-fill", (v / max) * 100 + "%");
    const sharp = unit === "px" && v === 0;            // "Desfoque" 0: really sharp
    input.setAttribute("aria-valuetext", sharp ? tr("aria.sharp") : v + " " + unit);
    out.textContent = sharp ? tr("val.sharp") : v + (unit === "px" ? " px" : unit === "%" ? PCT : unit);
  }

  /** "Cores" + "Wallpaper" tabs from CFG / WP */
  function syncLook() {
    if (!el.panel) return;
    const R = el.pRef, p = el.panel, C = CFG.colors, Wl = CFG.wallpaper, pair = lookPair();
    for (const n of p.querySelectorAll(".nd-ap__pal")) {
      const on = n.dataset.pal === C.preset;
      n.classList.toggle("nd-ap__opt--on", on);
      n.querySelector("input").checked = on;
    }
    const cc = p.querySelector('.nd-ap__pal[data-pal="custom"]');
    cc.style.setProperty("--c1", C.custom[0]);
    cc.style.setProperty("--c2", C.custom[1]);
    R.customBox.hidden = C.preset !== "custom";
    if (C.preset === "custom") syncCustom();
    const wall = C.preset === "wall";
    R.match.setAttribute("aria-pressed", String(wall));
    R.match.classList.toggle("nd-ap__opt--on", wall);
    const mp = C.auto || pair;
    R.matchSw.style.setProperty("--c1", mp[0]);
    R.matchSw.style.setProperty("--c2", mp[1]);
    R.matchSw.hidden = !C.auto && !wall;
    R.matchHint.textContent = tr(!wall ? "col.match.hint.off"
      : Wl.mode === "cover" && WP.kind === "cover" ? "col.match.hint.cover"
      : "col.match.hint.on");
    // without the NeonDrift theme the colours / the wallpaper only change the ambient mode, the panel and the button:
    // a note at the top of both tabs (the footer's text is about the theme, so it goes)
    R.colorsFoot.textContent = THEME.on ? tr("col.foot") : "";
    R.colorsNoTheme.hidden = THEME.on;
    R.wallNoTheme.hidden = THEME.on;
    R.layoutBlurRow.hidden = !THEME.on;
    // wallpaper
    for (const n of p.querySelectorAll(".nd-ap__wopt")) {
      const on = n.dataset.wall === Wl.mode;
      n.classList.toggle("nd-ap__opt--on", on);
      n.querySelector("input").checked = on;
    }
    const thumb = (n, url) => {
      const v = url ? 'url("' + String(url).replace(/["\\\n\r]/g, "") + '")' : "";
      if (n.style.backgroundImage !== v) n.style.backgroundImage = v;
      n.classList.toggle("nd-ap__wthumb--img", !!url);
    };
    thumb(R["wthumb-default"], builtinWall());
    thumb(R["wthumb-file"], Wl.file && WP.fileUrl ? WP.fileUrl : "");
    const item = currentItem();
    thumb(R["wthumb-cover"], (item && thumbOf(item)) || "");
    const f = Wl.file;
    R.fileInfo.textContent = f
      ? f.name + " · " + (f.w && f.h ? f.w + "×" + f.h + " · " : "") + fmtBytes(f.size)
      : tr("wall.fileInfo.empty");
    R.fileInfo.title = R.fileInfo.textContent;
    R.pick.textContent = tr(f ? "wall.change" : "wall.pick");
    R.removeFile.disabled = !f;
    R.wallHint.textContent = tr(
      Wl.mode === "cover" ? (WP.note !== "nocover" ? "wall.hint.cover"
        : WP.kind === "file" || (WP.kind !== "default" && Wl.file) ? "wall.hint.noCover.file" : "wall.hint.noCover.default")
      : Wl.mode === "file" ? (WP.note === "nofile" ? "wall.hint.noFile" : "wall.hint.file")
      : "wall.hint.default");
    setRangeU(R.dim, R.dimv, Wl.dim, 80, "%");
    const B = wallBlur();                                // "Capa do álbum" has its own pair
    setRangeU(R.layoutBlur, R.layoutBlurv, B.layout, BLUR_MAX, "px");
    setRangeU(R.ambBlur, R.ambBlurv, B.amb, BLUR_MAX, "px");
    // which part of the screen each "Desfoque" changes, in plain words (without the theme: only the ambient one)
    R.blurHint.textContent = (B.cover ? tr("wall.blurHint.cover") : "") + (THEME.on ? tr("wall.blurHint.layout") : "") +
      tr("wall.blurHint.amb") + tr("wall.blurHint.zero");
    wallNote(WP.noteText, WP.noteWarn);
    if (S.wall === "css") paintAmbPreview();             // a GIF: the preview draws the picture itself
  }
  /** "Personalizado": the chips, gradient bar, HSV sliders (painted tracks) and hex field */
  function syncCustom() {
    const R = el.pRef, C = CFG.colors, i = S.cEdit || 0, hex = C.custom[i];
    if (S.hsvHex !== hex || !S.hsv) { S.hsv = rgbHsv(hexRgb(hex)); S.hsvHex = hex; }
    const [h, s, v] = S.hsv;
    for (let k = 0; k < 2; k++) {
      R["c" + k].setAttribute("aria-pressed", String(k === i));
      R["c" + k + "dot"].style.background = C.custom[k];
      R["c" + k + "hex"].textContent = C.custom[k].toUpperCase();
    }
    R.gradBar.style.background = "linear-gradient(90deg, " + C.custom[0] + ", " + C.custom[1] + ")";
    const paint = (input, out, val, unit, track) => {
      const vv = Math.round(val);
      if (Number(input.value) !== vv) input.value = String(vv);
      input.style.setProperty("--nda-track", track);
      input.style.setProperty("--nda-thumb", hex);
      input.setAttribute("aria-valuetext", unit === "°" ? tr("aria.degrees", { n: vv }) : vv + " %");
      out.textContent = vv + (unit === "%" ? PCT : unit);
    };
    paint(R["hsv-h"], R["hsv-hv"], h, "°", "linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)");
    paint(R["hsv-s"], R["hsv-sv"], s * 100, "%", "linear-gradient(90deg, " + rgbHex(hsvRgb(h, 0, v)) + ", " + rgbHex(hsvRgb(h, 1, v)) + ")");
    paint(R["hsv-v"], R["hsv-vv"], v * 100, "%", "linear-gradient(90deg, #000, " + rgbHex(hsvRgb(h, s, 1)) + ")");
    if (document.activeElement !== R.hex) R.hex.value = hex.toUpperCase();
    const dark = C.custom.some((x) => contrast(hexRgb(x), [11, 26, 54]) < 2.6);
    R.cWarn.textContent = dark ? tr("col.darkWarn") : "";
  }
  const parseHex = (v) => {
    let t = String(v || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(t)) t = t.split("").map((ch) => ch + ch).join("");
    return /^[0-9a-f]{6}$/i.test(t) ? "#" + t.toLowerCase() : null;
  };
  function setCustom(i, hex, keepHsv) {
    const next = clone(CFG);
    next.colors.custom[i] = hex;
    next.colors.preset = "custom";
    if (keepHsv) S.hsvHex = hex;           // the sliders keep their own (unrounded) HSV
    applySettings(next, false);
  }

  function onPanelInput(e) {
    const t = e.target, ref = t.getAttribute("data-ref") || "";
    const next = clone(CFG);
    if (ref === "enabled") { setEnabled(t.checked, false); return; }
    if (t.name === "nd-ap-pal") { setPreset(t.value); return; }
    if (t.name === "nd-ap-wall") { setWallMode(t.value); return; }
    if (ref.startsWith("hsv-")) {
      S.lookDrag = true;
      const k = "hsv".indexOf(ref.slice(4)), val = Number(t.value);
      if (!S.hsv || S.hsvHex !== CFG.colors.custom[S.cEdit || 0]) S.hsv = rgbHsv(hexRgb(CFG.colors.custom[S.cEdit || 0]));
      S.hsv[k] = k === 0 ? val % 360 : val / 100;
      setCustom(S.cEdit || 0, rgbHex(hsvRgb(S.hsv[0], S.hsv[1], S.hsv[2])), true);
      return;
    }
    if (ref === "hex") { const h = parseHex(t.value); if (h && h !== CFG.colors.custom[S.cEdit || 0]) setCustom(S.cEdit || 0, h, false); return; }
    if (t.name === "nd-ap-rhythm") next.rhythm = t.value;
    else if (t.name === "nd-ap-style") next.style = t.value;
    else if (t.name === "nd-ap-idle") next.idleSec = Number(t.value);
    else if (ref === "sInt") next.intensity[CFG.style] = Number(t.value);       // the box always edits the selected style
    else if (ref === "sReach") next.reach[CFG.style] = Number(t.value);
    else if (ref === "sFall") next.fall[CFG.style] = fallFromPos(Number(t.value));
    else if (ref === "sCaps") next.caps[CFG.style] = t.checked;
    else if (/^(zoom|glow|groove)-on$/.test(ref)) next[ref.slice(0, -3)].on = t.checked;
    else if (/^(zoom|glow|groove)-amt$/.test(ref)) next[ref.slice(0, -4)].amount = Number(t.value);
    else if (ref === "el-on") next.layers.on = t.checked;                       // v5b "Camadas por elemento"
    else if (ref === "el-hue") next.layers.hue = t.checked;
    else if (/^el-(low|voice|air|entry|snare|mood)-on$/.test(ref)) next.layers[ref.slice(3, -3)].on = t.checked;
    else if (/^el-(low|voice|air|entry|snare|mood)-amt$/.test(ref)) next.layers[ref.slice(3, -4)].amount = Number(t.value);
    else if (ref === "dim") { S.lookDrag = true; next.wallpaper.dim = Number(t.value); }
    else if (ref === "layoutBlur" || ref === "ambBlur") {   // the pair of the selected wallpaper ("Capa do álbum" has its own)
      S.lookDrag = true;
      const B = wallBlur();
      next.wallpaper[ref === "layoutBlur" ? B.kL : B.kA] = Number(t.value);
    }
    else return;
    // "Quando o grave entra" / "Subidas e calmarias" show a sample in the preview (one at a time while dragging)
    const dm = /^el-(entry|mood)-(on|amt)$/.exec(ref);
    if (dm && (ref.endsWith("-on") ? t.checked : Number(t.value) > 0) &&
        !(S.pvDemo && S.pvDemo.k === dm[1] && now() - S.pvDemo.at < (dm[1] === "entry" ? EL_ENTRY_MS : EL_DEMO_RISE + EL_ENTRY_MS))) S.pvDemo = { k: dm[1], at: now() };
    applySettings(next, false);
    try { pvSoloFrom(ref, t); } catch (err) { S.pvSolo = null; }   // the preview highlights what changed
  }
  /** which part of the visual a control belongs to; the preview highlights it for SOLO_MS (the rest dims), and
      a beat-driven one gets a sample beat when the music has none at that moment (pvKickFrame) */
  const SOLO_OF = { "el-low": "low", "el-voice": "voice", "el-air": "air", "el-entry": "entry", "el-snare": "snare", "el-mood": "mood", "el-hue": "hue",
    zoom: "zoom", glow: "glow", groove: "groove", sInt: "int", sFall: "fall", sCaps: "caps", sReach: "reach" };
  const SOLO_NAME = { low: "el.low", voice: "el.voice", air: "el.air", entry: "el.entry", snare: "el.snare",
    mood: "el.mood", hue: "el.hue", zoom: "fx.zoom", glow: "fx.glow", groove: "fx.groove",
    int: "ctl.intensity", fall: "ctl.fall", caps: "ctl.caps", reach: "ctl.reach" };
  const soloName = (k) => (SOLO_NAME[k] ? tr(SOLO_NAME[k]) : "");
  const SOLO_BEAT = { zoom: 1, glow: 1, groove: 1, int: 1, fall: 1, caps: 1 };
  // the style controls size / time the crown itself: dimming the layers while one is moved made the crown ~30 %
  // smaller ("Intensidade" up, the preview down); they keep the chip (and the sample beat on music without a beat)
  const SOLO_NODIM = { int: 1, fall: 1, caps: 1, reach: 1 };
  const SOLO_LAYER = { G: "low", V: "voice", A: "air", E: "entry", S: "snare", M: "mood" };
  const SOLO_MS = 1500, SOLO_IN = 140, SOLO_OUT = 450, SOLO_DIM = 0.8;
  function pvSoloFrom(ref, t) {
    const m = /^(el-[a-z]+|zoom|glow|groove|sInt|sFall|sCaps|sReach)(?:-(on|amt))?$/.exec(ref || ""), k = m && SOLO_OF[m[1]];
    if (!k) return;
    if ((m[2] === "on" || ref === "el-hue" || ref === "sCaps") && t && !t.checked) return;   // switched off: nothing to show
    if (m[1].startsWith("el-") && !(CFG.layers && CFG.layers.on)) return;
    const T = now(), P = S.pvSolo, live = P && T - P.at < SOLO_MS + SOLO_OUT;
    if (live && P.k === k) P.at = T;                                   // dragging: the highlight holds
    else S.pvSolo = { k, at: T, t0: live ? T - SOLO_IN : T };          // from another highlight: no dip
    const noBeat = num(SIG.preview.drums, 1) < 0.2 || num(SIG.preview.soft, 0) > 0.3;
    if (SOLO_BEAT[k] && noBeat && !(S.pvKick && T - S.pvKick.at < PV_KICK_N * PV_KICK_GAP)) S.pvKick = { at: T };
    if (k === "snare" && !(S.pvSnap && T - S.pvSnap.at < 1400)) {
      const E = SIG.preview.ext && SIG.preview.ext.el;
      if (!E || num(E.snapAge, 1e9) > 900) S.pvSnap = { at: T };
    }
    S.pvSolo.demo = !!(S.pvKick && SOLO_BEAT[k]);
  }
  /** 0..1 the highlight's strength now (fades in SOLO_IN, holds SOLO_MS after the last change, fades out SOLO_OUT) */
  function soloLevel(T) {
    const P = S.pvSolo;
    if (!P) return 0;
    const a = T - P.t0, b = T - P.at;
    if (b > SOLO_MS + SOLO_OUT || a < 0) { S.pvSolo = null; return 0; }
    return smooth(Math.min(clamp(a / SOLO_IN, 0, 1), b < SOLO_MS ? 1 : 1 - (b - SOLO_MS) / SOLO_OUT));
  }
  /** the preview's dimmed layer amounts while a part is highlighted (null: none). A layer: the other layers dim by SOLO_DIM;
      an effect / style control: the layers dim by 0.6 (the beat's part shows); "Alcance": nothing dims */
  function soloK(sv) {
    const P = S.pvSolo, K0 = elK();
    if (!P || !K0 || sv <= 0.001 || SOLO_NODIM[P.k]) return null;
    const layer = Object.values(SOLO_LAYER).includes(P.k) || P.k === "hue", d = 1 - (layer ? SOLO_DIM : 0.6) * sv, o = Object.assign({}, K0);
    for (const f of Object.keys(SOLO_LAYER)) {
      const mine = SOLO_LAYER[f] === P.k || (P.k === "hue" && f === "V");
      if (!mine) o[f] = K0[f] * d;
    }
    return o;
  }
  /** the dock: shown once the big preview has scrolled up under its place (with a little hysteresis) */
  const DOCK_H = 92;
  function scheduleDock() { if (!S.dockRaf) S.dockRaf = requestAnimationFrame(dockCheck); }
  function dockCheck() {
    S.dockRaf = 0;
    const R = el.pRef, pane = el.pane;
    if (!R || !pane || !R.pvBox) return;
    let on = false;
    if (S.panelOpen && !pane.hidden && S.tab === "amb") {
      const pr = R.pvBox.getBoundingClientRect(), br = pane.getBoundingClientRect(), edge = br.top + DOCK_H + 10;
      on = pr.height > 0 && (S.docked ? pr.bottom < edge + 8 : pr.bottom < edge - 8);
    }
    if (on === !!S.docked) return;
    S.docked = on;
    if (on) {
      const w = R.pvBox.clientWidth, h = R.pvBox.clientHeight;
      if (w && h) R.dock.style.width = Math.round((DOCK_H * w) / h) + "px";
      drawDock(V.preview);                       // the first frame at once (no empty card sliding in)
    } else S.dockOffAt = now();
    pane.classList.toggle("nd-ap__body--docked", on);
  }
  /** the mini preview: a scaled copy of the preview's canvas (same aspect), drawn while docked or fading out */
  function drawDock(v) {
    const cv = el.pRef && el.pRef.dockCv, c = el.dockCtx;
    if (!cv || !c || !v || !v.cv.width) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(v.cv, 0, 0, v.cv.width, v.cv.height, 0, 0, W, H);
  }
  /** a control that takes the KEYBOARD focus under the docked preview scrolls down into view below it (it is never hidden
      by it). Never on a mouse / touch focus: that focus comes on the press, and scrolling the control away while
      the button is held lost the click (a switch did not toggle) or the drag (a slider stayed put); a control the pointer
      can press is visible already (the dock itself catches presses on it) */
  const focusByKey = (t) => { try { return t.matches(":focus-visible"); } catch (err) { return false; } };
  function onPaneFocus(e) {
    const R = el.pRef, pane = el.pane, t = e.target;
    if (!S.docked || !R || !pane || !t || !t.getBoundingClientRect || R.dock.contains(t) || !focusByKey(t)) return;
    requestAnimationFrame(() => {               // after the browser's own focus scroll (keyboard: scroll-padding-top)
      if (!S.docked || document.activeElement !== t || !focusByKey(t)) return;
      const br = pane.getBoundingClientRect(), r = t.getBoundingClientRect(), lim = br.top + DOCK_H + 14;
      if (r.top < lim && r.bottom > br.top - 400) {
        try { pane.scrollBy({ top: r.top - lim - 6, behavior: S.reducedMotion ? "auto" : "smooth" }); } catch (err) { pane.scrollTop += r.top - lim - 6; }
      }
    });
  }
  function onPanelChange(e) {
    const t = e.target, ref = (t && t.getAttribute && t.getAttribute("data-ref")) || "";
    if (ref === "file") {
      S.filePicking = false;
      const f = t.files && t.files[0];
      t.value = "";                          // the same file can be chosen again
      if (f) importWallFile(f); else syncLook();
      return;
    }
    if (ref === "hex") { commitHex(true); return; }
    if (S.lookDrag) { S.lookDrag = false; clearTimeout(LOOK.timer); LOOK.timer = 0; scheduleLook(); }   // released: the final value now
    saveSettings(true);
  }
  /** the hex field: a valid code is the colour; anything else goes back to the current one */
  function commitHex(use) {
    const R = el.pRef, i = S.cEdit || 0, h = use ? parseHex(R.hex.value) : null;
    if (h && h !== CFG.colors.custom[i]) setCustom(i, h, false);
    R.hex.value = CFG.colors.custom[i].toUpperCase();
    saveSettings(true);
  }
  function setPreset(id) {
    const next = clone(CFG);
    if (id === "custom" && next.colors.preset !== "custom" &&
        next.colors.custom.join() === DEFAULTS.colors.custom.join()) next.colors.custom = lookPair().slice();   // start from what is on screen
    next.colors.preset = id;
    applySettings(next, false);
  }
  /** "Imagem do computador" without a stored picture opens the file picker first */
  function setWallMode(mode) {
    if (mode === "file" && !CFG.wallpaper.file) {
      if (now() - (S.wallArrowAt || -1e9) < 300) { wallNote(tr("wall.pressEnter"), false); syncLook(); return; }
      openFilePicker(); syncLook(); return;
    }
    const next = clone(CFG);
    next.wallpaper.mode = mode;
    wallNote("", false);
    applySettings(next, true);
  }
  function openFilePicker() {
    if (!el.pRef) return;
    S.filePicking = true;
    try { el.pRef.file.click(); } catch (e) { S.filePicking = false; }
  }
  /** a reset that asks first. The first click arms the button (armedLabel for ARM_MS); a second, SEPARATE click in
      that time runs it. A click that belongs to the arming gesture - the second click of a double-click (e.detail > 1) or
      any click within ARM_GUARD_MS of arming - is ignored (otherwise a normal double-click would arm and confirm at once).
      Used by every reset that loses choices someone made. */
  const ARM_MS = 5000, ARM_GUARD_MS = 600;
  function armOnce(b, e, armedLabel, run) {
    const t = now(), A = S.armed || (S.armed = {}), k = b.getAttribute("data-ref"), st = A[k];
    if (st && st.until > t) {
      if ((e && e.detail > 1) || t - st.at < ARM_GUARD_MS) return;
      disarm(k);
      run();
      return;
    }
    if (e && e.detail > 1) return;                 // the tail of a double-click on a button that was not armed
    disarm(k);
    A[k] = { at: t, until: t + ARM_MS, label: b.textContent, b, timer: setTimeout(() => disarm(k), ARM_MS) };
    b.textContent = armedLabel;
    b.classList.add("nd-ap__btn--armed");
    b.setAttribute("aria-live", "polite");
  }
  function disarm(k) {
    const A = S.armed || {}, list = k ? [k] : Object.keys(A);
    for (const q of list) {
      const st = A[q];
      if (!st) continue;
      clearTimeout(st.timer);
      st.b.textContent = st.label;
      st.b.classList.remove("nd-ap__btn--armed");
      st.b.removeAttribute("aria-live");
      A[q] = null;
    }
  }
  function onPanelClick(e) {
    const tab = e.target.closest(".nd-ap__tab");
    if (tab) { setTab(tab.dataset.tab, true); return; }
    const b = e.target.closest("button[data-ref]");
    if (!b) return;
    const ref = b.getAttribute("data-ref");
    if (ref === "close") closePanel(true);
    else if (ref === "compatOk") {
      try { localStorage.setItem(COMPAT_NOTE_KEY, versions().spotify); } catch (err) { /* ignore */ }
      S.compatNote = null;
      syncCompat();
    }
    else if (ref === "reset") {
      // two clicks (one click would wipe the whole tab with no way back); a double-click does not count as both
      // (armOnce); the label fits the button
      armOnce(b, e, tr("arm.again"), () => {
        // the ambient look goes back to default; the on / off choice, colours and wallpaper stay
        applySettings(Object.assign(clone(DEFAULTS), { enabled: CFG.enabled, colors: clone(CFG.colors), wallpaper: clone(CFG.wallpaper) }), true);
        try { Spicetify.showNotification(tr("toast.reset.amb")); } catch (err) { /* ignore */ }
      });
    } else if (ref === "resetColors") {             // one click: "Combinar com o wallpaper" is one click to get back
      const next = clone(CFG);
      next.colors.preset = DEFAULTS.colors.preset;
      applySettings(next, true);
      try { Spicetify.showNotification(tr("toast.reset.colors")); } catch (err) { /* ignore */ }
    } else if (ref === "resetWall") {                // asks first (the cover's own blur pair is lost otherwise)
      armOnce(b, e, tr("arm.again"), () => {
        const next = clone(CFG);
        next.wallpaper = Object.assign(clone(DEFAULTS.wallpaper), { file: CFG.wallpaper.file });   // the stored picture stays ("Remover" deletes it)
        wallNote("", false);
        applySettings(next, true);
        try { Spicetify.showNotification(tr("toast.reset.wall")); } catch (err) { /* ignore */ }
      });
    } else if (ref === "c0" || ref === "c1") { S.cEdit = Number(ref[1]); S.hsvHex = null; syncCustom(); }
    else if (ref === "swap") {
      const next = clone(CFG);
      next.colors.custom = [CFG.colors.custom[1], CFG.colors.custom[0]];
      next.colors.preset = "custom";
      S.hsvHex = null;
      applySettings(next, true);
    } else if (ref === "match") matchWallpaper(true);
    else if (ref === "pick") openFilePicker();
    else if (ref === "removeFile") removeWallFile();
    else if (ref === "test") testNow("amb");
    else if (ref === "ambTest") testNow("wall");
    else if (ref === "elMore") {                         // the rows' disclosure
      S.elOpen = !S.elOpen;
      syncElBox();
      // bring the opened rows into view (they open under the sticky footer)
      if (S.elOpen && el.pRef.elBox && el.pRef.elBox.scrollIntoView) {
        try { el.pRef.elBox.scrollIntoView({ block: "start", behavior: S.reducedMotion ? "auto" : "smooth" }); } catch (err) { /* ignore */ }
      }
    }
    else if (ref === "elReset") {                        // only the "Camadas por elemento" box; asks first
      armOnce(b, e, tr("arm.confirm"), () => {
        const next = clone(CFG);
        next.layers = clone(DEFAULTS.layers);
        applySettings(next, true);
        try { Spicetify.showNotification(tr("toast.reset.layers")); } catch (err) { /* ignore */ }
      });
    } else if (ref === "sbReset") {                      // only the selected style's own settings; asks first
      armOnce(b, e, tr("arm.confirm"), () => {
        const next = clone(CFG), id = CFG.style;
        next.intensity[id] = DEFAULTS.intensity[id]; next.reach[id] = DEFAULTS.reach[id]; next.fall[id] = DEFAULTS.fall[id];
        if (id in DEFAULTS.caps) next.caps[id] = DEFAULTS.caps[id];
        applySettings(next, true);
        try { Spicetify.showNotification(tr("toast.reset.style", { name: STYLES.find((x) => x.id === id).name })); } catch (err) { /* ignore */ }
      });
    }
  }
  /** keys inside the panel that it handles itself (the window-level shield
      stops them before any listener on the panel would see them): arrows /
      Home / End move between the tabs */
  function onPanelKey(e) {
    const t = e.target;
    if (t && t.name === "nd-ap-wall") {
      if (/^Arrow/.test(e.key)) S.wallArrowAt = now();        // an arrow moves the radio: no file dialog
      else if ((e.key === "Enter" || e.key === " ") && t.value === "file" && !CFG.wallpaper.file && !e.repeat) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFilePicker();
        return true;
      }
    }
    if (t && el.pRef && t === el.pRef.hex && (e.key === "Enter" ||
        ((e.key === "Escape" || e.key === "Esc") && t.value.toLowerCase() !== CFG.colors.custom[S.cEdit || 0]))) {   // a 2nd Esc closes the panel
      e.preventDefault();
      e.stopImmediatePropagation();
      commitHex(e.key === "Enter");              // Enter: use the code (or go back if it is not one); Esc: undo the typing
      return true;
    }
    if (!t || !t.classList || !t.classList.contains("nd-ap__tab") || e.ctrlKey || e.metaKey || e.altKey) return false;
    const i = TAB_IDS.indexOf(t.dataset.tab), n = TAB_IDS.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    setTab(TAB_IDS[j], true);
    return true;
  }

  /** "Testar agora" ("Ambiente" tab) / "Ver no modo ambiente" ("Wallpaper" tab): the panel comes back on that tab */
  function testNow(tab) {
    S.testTab = TAB_IDS.includes(tab) ? tab : "amb";
    closePanel(false);
    S.graceUntil = now() + TEST_GRACE_MS;
    S.reopenPanel = now() + TEST_REOPEN_MS;
    enter("test");
  }

  /** the button the panel hangs from: the top-bar one, else the player-bar one (the panel then opens upwards) */
  function anchorRect() {
    for (const b of [topBtn && topBtn.button, playBtn && playBtn.element]) {
      if (!b || !b.isConnected) continue;
      const r = b.getBoundingClientRect();
      if (r.width && r.height) return r;
    }
    return null;
  }
  function positionPanel() {
    const p = el.panel;
    if (!p) return;
    const W = p.offsetWidth || 400, vw = window.innerWidth, vh = window.innerHeight;
    const r = anchorRect();
    let left, top;
    // a button in the lower half of the window with little room under it (a theme that moved the top bar): the
    // panel opens upwards, anchored by its bottom edge
    const up = !!r && vh - r.bottom < 380 && r.top > vh - r.bottom;
    if (r) {
      left = clamp(r.right - W + 8, 8, vw - W - 8);
      top = Math.round(r.bottom + 8);
      p.style.setProperty("--nda-ap-arrow", clamp(r.left + r.width / 2 - left, 18, W - 18) + "px");
      p.classList.remove("nd-ap--center");
    } else {                                     // no top-bar button: centred near the top
      left = Math.round((vw - W) / 2);
      top = 64;
      p.classList.add("nd-ap--center");
    }
    p.classList.toggle("nd-ap--above", up);
    p.style.left = Math.round(left) + "px";
    if (up) {
      p.style.top = "auto";
      p.style.bottom = Math.round(vh - r.top + 8) + "px";
      p.style.maxHeight = Math.max(240, r.top - 20) + "px";
    } else {
      p.style.removeProperty("bottom");
      p.style.top = top + "px";
      p.style.maxHeight = Math.max(240, vh - top - 12) + "px";
    }
    if (S.panelOpen) scheduleDock();              // a new height may (un)dock the preview
  }

  function openPanel(focusFirst) {
    if (S.destroyed) return;
    if (isActive()) exit("panel");
    if (LANG_SRC === "fallback" && resolveLang()) relabel();   // Spicetify.Locale was not there at init
    checkTheme();
    buildPanel();
    resetDyn(V.preview);                          // the preview starts fresh too
    prepare();                                    // wallpaper + analysis for the preview
    refreshOutSel(true);
    S.dev = null;                                 // the output may have changed since
    syncPanel();
    S.pdemo = null;
    SIG.preview.gate = 1;
    el.panel.hidden = false;
    S.panelOpen = true;
    positionPanel();
    el.panel.classList.add("nd-ap--open");
    S.panelOpenAt = now();                        // the soft mode's note shows once per opening
    scheduleDock();
    if (topBtn) {
      topBtn.button.setAttribute("aria-expanded", "true");
      topBtn.element.classList.add("nd-amb-topbtn--open");
      try { if (topBtn.tippy) { topBtn.tippy.hide(); topBtn.tippy.disable(); } } catch (e) { /* ignore */ }   // no tooltip over the panel
    }
    syncClock(true);
    startLoop();
    syncLook();                                   // cover thumbnail, stored picture
    if (focusFirst) {
      const f = el.panel.querySelector('.nd-ap__tab[aria-selected="true"]') || el.pRef.enabled;
      try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  function closePanel(restoreFocus) {
    if (!S.panelOpen || !el.panel) return;
    S.panelOpen = false;
    disarm();                                      // an armed reset never waits for the next time the panel opens
    S.pvSolo = S.pvKick = S.pvSnap = null;         // no highlight / sample left for the next opening
    if (S.docked) { S.docked = false; if (el.pane) el.pane.classList.remove("nd-ap__body--docked"); }
    saveSettings(true);
    el.panel.classList.remove("nd-ap--open");
    el.panel.hidden = true;
    if (topBtn) {
      topBtn.button.setAttribute("aria-expanded", "false");
      topBtn.element.classList.remove("nd-amb-topbtn--open");
      try { if (topBtn.tippy) topBtn.tippy.enable(); } catch (e) { /* ignore */ }
    }
    S.lastActivity = now();
    if (restoreFocus && topBtn && topBtn.button.isConnected) {
      try { topBtn.button.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    if (S.phase === "off") stopLoop();
  }
  function togglePanel(focusFirst) {
    if (S.panelOpen) closePanel(false); else openPanel(focusFirst);
  }
  /** closes the panel on a pointerdown outside it (and outside its button) */
  function onPanelOutside(e) {
    if (!S.panelOpen) return;
    const t = e.target;
    if (el.panel && el.panel.contains(t)) return;
    if (topBtn && topBtn.element.contains(t)) return;
    if (playBtn && playBtn.element && playBtn.element.contains(t)) return;   // its own click toggles the panel
    closePanel(false);
  }

