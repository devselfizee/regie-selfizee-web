// @ts-nocheck — extracted from useCanvasInit, implicit any types throughout
/* eslint-disable @typescript-eslint/no-explicit-any */

import { getCheckerCanvas } from "../index";
import { CUSTOM_PROPS } from "../types";
import { loadCanvasState } from "./canvasDB";

// Module-level guard: fabric global defaults/prototype controls are mutated
// only once, not on every createCanvas() call.
let _defaultsPatched = false;

// Module-level timer for the delayed saveHistory() call inside
// restoreCanvasState(). Cleared on repeat calls so stale timers can't fire
// against an unmounted canvas.
let _restoreSaveHistoryTimer: ReturnType<typeof setTimeout> | null = null;

// ── Canvas creation + fabric defaults ──

export async function createCanvas(
  canvasEl: HTMLCanvasElement,
  bufferWidth: number,
  bufferHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
) {
  const fabric = await import("fabric");

  // Guard against double-init in React Strict Mode: if the element already
  // has a fabric canvas attached, dispose it first to avoid the
  // "Trying to initialize a canvas that has already been initialized" error.
  if ((canvasEl as any).__fabricCanvas) {
    try {
      const old = (canvasEl as any).__fabricCanvas;
      // Suppress fabric's internal "aborted" rejection from __cleanupTask
      if (old.__cleanupTask?.kill) {
        const origKill = old.__cleanupTask.kill;
        old.__cleanupTask.kill = (...args: any[]) => { try { origKill.call(old.__cleanupTask, ...args); } catch { /* suppress */ } };
      }
      // dispose() is async — await it before creating a new fabric.Canvas on
      // the same DOM element to avoid a race where fabric's internal cleanup
      // interferes with the freshly constructed canvas.
      await Promise.resolve(old.dispose?.()).catch(() => { /* suppress async "aborted" */ });
    } catch { /* ignore sync errors */ }
  }

  // Safari (desktop + iOS) caps canvas dimensions around 4096-4096 area
  // product on some versions; Chrome at 16384. Large formats with heavy
  // bleed (buffer = canvas + 2*BLEED_PX) can push past these limits and
  // produce blank exports silently. Clamp the fabric canvas to a safe
  // ceiling; objects are still positioned in the logical space.
  const MAX_CANVAS_DIM = 16380;
  const clampedBufferW = Math.min(bufferWidth, MAX_CANVAS_DIM);
  const clampedBufferH = Math.min(bufferHeight, MAX_CANVAS_DIM);
  if (clampedBufferW !== bufferWidth || clampedBufferH !== bufferHeight) {
    console.warn(
      `Canvas buffer ${bufferWidth}x${bufferHeight} exceeds browser limits; ` +
      `clamped to ${clampedBufferW}x${clampedBufferH}. Exports may be downscaled.`,
    );
  }

  const canvas = new fabric.Canvas(canvasEl, {
    width: clampedBufferW,
    height: clampedBufferH,
    backgroundColor: "transparent",
    selection: true,
    preserveObjectStacking: true,
    enableRetinaScaling: false,
    controlsAboveOverlay: true,
    uniformScaling: true,
    fireRightClick: true,
    stopContextMenu: true,
  });

  // Store reference on the DOM element for the guard above
  (canvasEl as any).__fabricCanvas = canvas;

  // White background rect for the design area.
  // strokeWidth: 0 is CRITICAL — fabric v7's default of 1 offsets the visual
  // bounds by 0.5px on each side and causes a visible gap against clipPath.
  const initBg = new fabric.Rect({
    left: BLEED_PX,
    top: BLEED_PX,
    width: canvasWidth,
    height: canvasHeight,
    fill: "#ffffff",
    stroke: null as any,
    strokeWidth: 0,
    originX: "left",
    originY: "top",
    selectable: false,
    evented: false,
    hoverCursor: "default",
  });
  (initBg as any)._isSolidBg = true;
  canvas.add(initBg);

  // Clip rendered content to design area (no stroke so edges are crisp).
  canvas.clipPath = new fabric.Rect({
    left: BLEED_PX,
    top: BLEED_PX,
    width: canvasWidth,
    height: canvasHeight,
    stroke: null as any,
    strokeWidth: 0,
    originX: "left",
    originY: "top",
    absolutePositioned: true,
  });

  // Memory optimization + selection styling + text handle render overrides
  // are applied to fabric globals — patch ONCE, not on every createCanvas().
  if (!_defaultsPatched) {
    fabric.FabricObject.ownDefaults.objectCaching = false;

    // Selection styling
    fabric.FabricObject.ownDefaults.borderColor = "#4f46e5";
    fabric.FabricObject.ownDefaults.cornerColor = "#4f46e5";
    fabric.FabricObject.ownDefaults.cornerStrokeColor = "#ffffff";
    fabric.FabricObject.ownDefaults.cornerSize = 12;
    fabric.FabricObject.ownDefaults.cornerStyle = "circle";
    fabric.FabricObject.ownDefaults.transparentCorners = false;
    fabric.FabricObject.ownDefaults.borderScaleFactor = 2.5;
    fabric.FabricObject.ownDefaults.borderDashArray = [6, 4];
    fabric.FabricObject.ownDefaults.padding = 0;

    // ── Canva-style text width handles (thick vertical bars for ml/mr) ──
    const renderTextWidthHandle = (
      ctx: CanvasRenderingContext2D,
      left: number,
      top: number,
      _styleOverride: any,
      _fabricObject: any,
    ) => {
      const barH = 24;
      const barW = 6;
      const r = 3;
      ctx.save();
      ctx.translate(left, top);
      ctx.beginPath();
      ctx.roundRect(-barW / 2, -barH / 2, barW, barH, r);
      ctx.fillStyle = "#4f46e5";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // Apply custom render to Textbox ml/mr controls
    if (fabric.Textbox) {
      const proto = fabric.Textbox.prototype;
      if (proto.controls?.ml) {
        proto.controls.ml.render = renderTextWidthHandle;
        proto.controls.ml.sizeX = 6;
        proto.controls.ml.sizeY = 24;
        proto.controls.ml.touchSizeX = 28;
        proto.controls.ml.touchSizeY = 28;
      }
      if (proto.controls?.mr) {
        proto.controls.mr.render = renderTextWidthHandle;
        proto.controls.mr.sizeX = 6;
        proto.controls.mr.sizeY = 24;
        proto.controls.mr.touchSizeX = 28;
        proto.controls.mr.touchSizeY = 28;
      }
    }

    _defaultsPatched = true;
  }

  canvas.selectionColor = "rgba(124, 58, 237, 0.08)";
  canvas.selectionBorderColor = "#4f46e5";
  canvas.selectionLineWidth = 1.5;
  canvas.selectionDashArray = [6, 4];

  // ── Canva-style text width handles (thick vertical bars for ml/mr) ──
  const renderTextWidthHandle = (
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    _styleOverride: any,
    _fabricObject: any,
  ) => {
    const barH = 24;
    const barW = 6;
    const r = 3;
    ctx.save();
    ctx.translate(left, top);
    ctx.beginPath();
    ctx.roundRect(-barW / 2, -barH / 2, barW, barH, r);
    ctx.fillStyle = "#4f46e5";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // Apply custom render to Textbox ml/mr controls
  if (fabric.Textbox) {
    const proto = fabric.Textbox.prototype;
    if (proto.controls?.ml) {
      proto.controls.ml.render = renderTextWidthHandle;
      proto.controls.ml.sizeX = 6;
      proto.controls.ml.sizeY = 24;
      proto.controls.ml.touchSizeX = 28;
      proto.controls.ml.touchSizeY = 28;
    }
    if (proto.controls?.mr) {
      proto.controls.mr.render = renderTextWidthHandle;
      proto.controls.mr.sizeX = 6;
      proto.controls.mr.sizeY = 24;
      proto.controls.mr.touchSizeX = 28;
      proto.controls.mr.touchSizeY = 28;
    }
  }

  return { canvas, fabric };
}

// ── Shoot zone creation from gabarit ──

export function createShootZones(
  canvas: any,
  fabric: any,
  gabarit: any,
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
) {
  gabarit.photoZones.forEach((zone: any, idx: number) => {
    const zoneLeft = BLEED_PX + (zone.x / 100) * canvasWidth;
    const zoneTop = BLEED_PX + (zone.y / 100) * canvasHeight;
    const zoneW = (zone.w / 100) * canvasWidth;
    const zoneH = (zone.h / 100) * canvasHeight;

    // Each shoot gets its OWN pattern instance to avoid shared patternTransform bugs
    const checkerPattern = new fabric.Pattern({ source: getCheckerCanvas(), repeat: "repeat" });

    const rect = new fabric.Rect({
      left: zoneLeft,
      top: zoneTop,
      width: zoneW,
      height: zoneH,
      originX: "left",
      originY: "top",
      fill: checkerPattern,
      stroke: "",
      strokeWidth: 0,
      strokeUniform: true,
      rx: 0,
      ry: 0,
      selectable: true,
      evented: true,
      padding: 0,
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hoverCursor: "pointer",
      noScaleCache: true,
    });
    (rect as any)._isShootZone = true;
    (rect as any)._shootBorderRadius = 0;
    (rect as any)._shootIndex = idx + 1;
    (rect as any)._shootLocked = true;
    canvas.add(rect);

    if (gabarit.photoZones.length > 1) {
      const label = new fabric.FabricText(`#${idx + 1}`, {
        left: zoneLeft + 8,
        top: zoneTop + 6,
        originX: "left",
        originY: "top",
        fontSize: 16,
        fontFamily: "sans-serif",
        fontWeight: "bold",
        fill: "#4f46e5",
        selectable: false,
        evented: false,
      });
      (label as any)._isShootLabel = true;
      (label as any)._shootZone = rect;
      (rect as any)._shootLabel = label;
      canvas.add(label);
    }
  });
}

// ── Text zone guides ──

export function createTextGuides(
  canvas: any,
  fabric: any,
  gabarit: any,
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
) {
  gabarit.textZones.forEach((zone: any) => {
    const zoneLeft = BLEED_PX + (zone.x / 100) * canvasWidth;
    const zoneTop = BLEED_PX + (zone.y / 100) * canvasHeight;
    const zoneW = (zone.w / 100) * canvasWidth;
    const zoneH = (zone.h / 100) * canvasHeight;

    const rect = new fabric.Rect({
      left: zoneLeft,
      top: zoneTop,
      width: zoneW,
      height: zoneH,
      originX: "left",
      originY: "top",
      fill: "transparent",
      stroke: "rgba(180, 180, 180, 0.3)",
      strokeWidth: 1,
      strokeUniform: true,
      strokeDashArray: [4, 3],
      selectable: false,
      evented: false,
      hoverCursor: "default",
    });
    (rect as any)._isTextGuide = true;
    canvas.add(rect);
  });
}

// ── Reapply custom properties after loadFromJSON ──

export function reapplyCustomProps(canvas: any, jsonObj?: any) {
  const objects = canvas.getObjects();
  if (jsonObj?.objects && Array.isArray(jsonObj.objects)) {
    const jsonObjects = jsonObj.objects;
    for (let i = 0; i < Math.min(objects.length, jsonObjects.length); i++) {
      const obj = objects[i] as any;
      const src = jsonObjects[i];
      for (const prop of CUSTOM_PROPS) {
        if (src[prop] !== undefined) {
          obj[prop] = src[prop];
        }
      }
    }
  }
  // Auto-fix: if an object has _shootIndex but lost _isShootZone, restore it
  objects.forEach((o: any) => {
    if (o._shootIndex && !o._isShootZone) {
      o._isShootZone = true;
    }
    if (o._isShootZone) {
      o.set({ noScaleCache: true });
    }
  });
  // Apply interactive properties based on custom props
  objects.forEach((o: any) => {
    if (o._isShootZone) {
      const locked = o._shootLocked !== false;
      o.set({
        visible: true,
        selectable: true,
        evented: true,
        lockMovementX: locked,
        lockMovementY: locked,
        lockScalingX: locked,
        lockScalingY: locked,
        lockRotation: locked,
        hasControls: !locked,
        hoverCursor: locked ? "pointer" : "move",
      });
    }
    if (o._isShootLabel || o._isTextGuide || o._isDesignAreaBg) {
      o.set({ visible: true, selectable: false, evented: false, excludeFromExport: true });
    }
    if (o._locked && !o._isShootZone) {
      o.set({
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        hoverCursor: "default",
      });
    }
  });
  // Re-link shoot labels to their zones
  const shoots = objects.filter((o: any) => o._isShootZone);
  const labels = objects.filter((o: any) => o._isShootLabel);
  shoots.forEach((shoot: any) => {
    const lbl = labels.find(
      (l: any) =>
        Math.abs((l.left || 0) - (shoot.left || 0) - 8) < 5 &&
        Math.abs((l.top || 0) - (shoot.top || 0) - 6) < 5,
    );
    if (lbl) {
      shoot._shootLabel = lbl;
      (lbl as any)._shootZone = shoot;
    }
  });
}

// ── State restoration ──

export async function restoreCanvasState(
  canvas: any,
  fabric: any,
  stateToRestore: string | object | null,
  bufferWidth: number,
  bufferHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
  isRestoringRef: any,
  autoSaveKey: string,
  initialFrameName: string | null,
  frameId: string | null,
  setFrameName: (v: string) => void,
  setBgColor: (v: string) => void,
  saveHistory: () => void,
) {
  // Track the pending saveHistory timer so repeat calls don't race, and so
  // we don't leave a stale timer pointed at an unmounted canvas. Using the
  // module-level _restoreSaveHistoryTimer declared at the top of this file.
  if (_restoreSaveHistoryTimer) {
    clearTimeout(_restoreSaveHistoryTimer);
    _restoreSaveHistoryTimer = null;
  }

  // Hissé au niveau fonction : rempli dans le préchargement des polices (bloc
  // fams>0) puis relu plus bas lors de la réécriture des fontFamily des objets
  // texte. Déclaré localement, il était hors de portée → ReferenceError avalée
  // → métriques texte jamais invalidées au rechargement.
  const fontRewrites = new Map<string, string>();

  try {
    if (stateToRestore) {
      isRestoringRef.current = true;
      try {
        const parsed = typeof stateToRestore === "string" ? JSON.parse(stateToRestore) : stateToRestore;

        // Preload every fontFamily referenced by text objects so Fabric
        // doesn't render them in the default fallback. Google fonts are
        // fetched via CSS; custom user-uploaded fonts are registered via
        // the @font-face loader before loadFromJSON renders.
        try {
          const fams = new Set<string>();
          const collect = (list: any[]) => {
            if (!Array.isArray(list)) return;
            for (const o of list) {
              if (!o) continue;
              if (o.fontFamily) fams.add(String(o.fontFamily));
              if (Array.isArray(o.styles)) {
                for (const s of o.styles) {
                  if (s?.fontFamily) fams.add(String(s.fontFamily));
                  if (s && typeof s === "object") {
                    for (const key of Object.keys(s)) {
                      const inner = (s as any)[key];
                      if (inner && typeof inner === "object" && inner.fontFamily) fams.add(String(inner.fontFamily));
                    }
                  }
                }
              }
              if (o.styles && typeof o.styles === "object" && !Array.isArray(o.styles)) {
                for (const lineKey of Object.keys(o.styles)) {
                  const line = (o.styles as any)[lineKey];
                  if (line && typeof line === "object") {
                    for (const chKey of Object.keys(line)) {
                      const ch = (line as any)[chKey];
                      if (ch?.fontFamily) fams.add(String(ch.fontFamily));
                    }
                  }
                }
              }
              if (Array.isArray(o.objects)) collect(o.objects);
            }
          };
          collect(parsed.objects || []);

          if (fams.size > 0) {
            const {
              loadGoogleFont,
              fetchCustomFontsFromApi,
              getCustomFonts,
              loadCustomFontFace,
              fetchExternalFontsByNames,
              GOOGLE_FONTS,
            } = await import("../panels/fonts");
            // Ensure the custom-font registry is populated so we can resolve
            // user-uploaded families.
            if (getCustomFonts().length === 0) {
              try { await fetchCustomFontsFromApi(); } catch { /* offline */ }
            }
            const customs = getCustomFonts();
            const customByName = new Map(customs.map((f: any) => [f.displayName, f]));
            // Canonical-case lookup so "MONTSERRAT" -> "Montserrat":
            // Google's CSS endpoint is case-sensitive, and Fabric matches
            // FontFace by exact family string, so we both load AND set
            // the canonical name on every text object that referenced
            // a non-canonical variant.
            const googleCanon = new Map<string, string>(
              GOOGLE_FONTS.map((n) => [n.toLowerCase(), n]),
            );
            const generic = new Set(["sans-serif", "serif", "monospace"]);

            // Partition the referenced families into:
            //   - already-registered customs  -> just attach @font-face
            //   - generic fallbacks            -> nothing to load
            //   - listed Google Fonts          -> loadGoogleFont(canonical)
            //   - unknown / booth fonts        -> ask /api/bibliotheques/external,
            //                                     fallback to loadGoogleFont if
            //                                     the booth doesn't host it.
            // Without the external step, a frame saved AFTER editing a
            // catalogue model would lose its booth fonts on re-edit: the
            // canvasState still references "Poppins-SemiBold" / "MONTSERRAT"
            // but those names aren't Google Font CSS-compatible and weren't
            // in the user's custom font registry on a fresh page load.
            const googleNeeded: string[] = [];
            const externalNeeded: string[] = [];
            for (const fam of Array.from(fams)) {
              if (!fam || generic.has(fam)) continue;
              if (customByName.has(fam)) {
                loadCustomFontFace(customByName.get(fam)!);
                try { if ((document as any).fonts?.load) await (document as any).fonts.load(`16px "${fam}"`); } catch { /* ignore */ }
                continue;
              }
              const canon = googleCanon.get(fam.toLowerCase());
              if (canon) {
                googleNeeded.push(canon);
                if (canon !== fam) fontRewrites.set(fam, canon);
              } else {
                externalNeeded.push(fam);
              }
            }

            const externalLoaded = externalNeeded.length > 0
              ? await fetchExternalFontsByNames(externalNeeded)
              : [];
            const externalLoadedNames = new Set(externalLoaded.map((f) => f.displayName));
            const googleFallbacks = externalNeeded.filter((n) => !externalLoadedNames.has(n));

            await Promise.all(
              [...googleNeeded, ...googleFallbacks.map((n) => {
                const canon = googleCanon.get(n.toLowerCase()) || n;
                if (canon !== n) fontRewrites.set(n, canon);
                return canon;
              })].map(async (fam) => {
                await loadGoogleFont(fam);
                // Google font CSS is now in the DOM, but `document.fonts.ready`
                // alone can resolve before the remote WOFF is fetched. Force
                // the actual font to load in several weights so every glyph
                // variant used by the textbox has real metrics before render.
                try {
                  if ((document as any).fonts?.load) {
                    await Promise.all([
                      (document as any).fonts.load(`400 16px "${fam}"`),
                      (document as any).fonts.load(`700 16px "${fam}"`),
                      (document as any).fonts.load(`italic 16px "${fam}"`),
                    ]);
                  }
                } catch { /* ignore */ }
              })
            );
            try { if ((document as any).fonts?.ready) await (document as any).fonts.ready; } catch { /* ignore */ }
          }
        } catch { /* fail silently — text will still load with fallback */ }

        // Resolve relative /uploads/... URLs to absolute backend URLs so
        // Fabric loads images from the correct server, not the frontend host.
        const BACKEND_BASE = process.env.NEXT_PUBLIC_STUDIO_BACKEND_URL || "";
        const resolveRelativeUrls = (objects: any[]) => {
          if (!Array.isArray(objects)) return;
          for (const o of objects) {
            if (!o) continue;
            if (typeof o.src === "string" && o.src.startsWith("/uploads/")) {
              o.src = `${BACKEND_BASE}${o.src}`;
            }
            if (Array.isArray(o.objects)) resolveRelativeUrls(o.objects);
          }
        };
        resolveRelativeUrls(parsed.objects || []);

        await canvas.loadFromJSON(parsed);
        canvas.setDimensions({ width: bufferWidth, height: bufferHeight });
        canvas.backgroundColor = "transparent";
        // Restore clipPath — loadFromJSON wipes it
        canvas.clipPath = new fabric.Rect({
          left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight,
          originX: "left", originY: "top", absolutePositioned: true,
        });
        reapplyCustomProps(canvas, parsed);
        // Repair shoot zones that lost their checker pattern fill (e.g. a save
        // that happened while preview mode had nulled it out). Each shoot
        // gets its own Pattern instance to avoid shared patternTransform bugs.
        canvas.getObjects().forEach((o: any) => {
          if (!o._isShootZone) return;
          const hasPattern = o.fill && typeof o.fill === "object" && (o.fill.type === "pattern" || o.fill.source);
          if (hasPattern) return;
          const pattern = new fabric.Pattern({ source: getCheckerCanvas(), repeat: "repeat" });
          o.set({ fill: pattern, stroke: "" });
          o.dirty = true;
        });
        // Capture solidBg fill and migrate legacy _isGradientBg before removing
        const solidBgObjs = canvas.getObjects().filter((o: any) => o._isSolidBg);
        let savedFill: any = solidBgObjs.length > 0 ? solidBgObjs[0].fill : null;
        // Migrate legacy gradient bg into solidBg fill
        const legacyGrad = canvas.getObjects().find((o: any) => o._isGradientBg);
        if (legacyGrad?.fill) savedFill = legacyGrad.fill;
        // Remove stale bg objects, offset all objects to buffer coords
        canvas
          .getObjects()
          .filter((o: any) => o._isDesignAreaBg || o._isSolidBg || o._isGradientBg)
          .forEach((o: any) => canvas.remove(o));
        canvas.getObjects().forEach((o: any) => {
          o.set({ left: (o.left || 0) + BLEED_PX, top: (o.top || 0) + BLEED_PX });
          o.setCoords();
        });
        // Restore solidBg with saved fill (color/gradient) or default white
        const isCustom = savedFill && savedFill !== "#ffffff" && savedFill !== "white" && savedFill !== "transparent";
        const bgFill = isCustom ? savedFill : "#ffffff";
        const dBg = new fabric.Rect({
          left: BLEED_PX,
          top: BLEED_PX,
          width: canvasWidth,
          height: canvasHeight,
          fill: bgFill,
          stroke: null as any,
          strokeWidth: 0,
          originX: "left",
          originY: "top",
          selectable: false,
          evented: false,
          hoverCursor: "default",
        });
        (dBg as any)._isSolidBg = true;
        canvas.add(dBg);
        canvas.sendObjectToBack(dBg);

        // After fonts loaded, invalidate Fabric's cached text metrics so the
        // actual font metrics replace the fallback-font measurements. Setting
        // fontFamily to itself via _set forces Fabric to clear its measurement
        // cache; initDimensions then recomputes with the real font.
        // Also rewrite non-canonical Google Font names ("MONTSERRAT" ->
        // "Montserrat") so Fabric resolves the FontFace we registered under
        // the canonical name. Same logic in applyCatalogueModel.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rewriteStyleFontFamily = (s: any, rw: Map<string, string>): any => {
          if (Array.isArray(s)) return s.map((x) => rewriteStyleFontFamily(x, rw));
          if (s && typeof s === "object") {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(s)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const v = (s as any)[k];
              if (k === "fontFamily" && typeof v === "string") {
                out[k] = rw.get(v) || v;
              } else if (v && typeof v === "object") {
                out[k] = rewriteStyleFontFamily(v, rw);
              } else {
                out[k] = v;
              }
            }
            return out;
          }
          return s;
        };
        canvas.getObjects().forEach((o: any) => {
          if (o.type === "textbox" || o.type === "i-text" || o.type === "text") {
            try {
              const fam = o.fontFamily;
              const rewritten = fam ? (fontRewrites.get(fam) || fam) : fam;
              if (rewritten && typeof o._set === "function") o._set("fontFamily", rewritten);
              if (fontRewrites.size > 0 && o.styles && typeof o.styles === "object") {
                o.styles = rewriteStyleFontFamily(o.styles, fontRewrites);
              }
              if (typeof o.initDimensions === "function") o.initDimensions();
              if (typeof o._forceClearCache === "boolean") o._forceClearCache = true;
              if (typeof o.dirty === "boolean") o.dirty = true;
              o.setCoords?.();
            } catch { /* ignore */ }
          }
        });
        // Ensure shoot labels exist — if missing (old save or serialization loss),
        // recreate them from the shoot zones.
        const shoots = canvas.getObjects().filter((o: any) => o._isShootZone);
        if (shoots.length > 1) {
          const existingLabels = canvas.getObjects().filter((o: any) => o._isShootLabel);
          const shootsWithoutLabel = shoots.filter((s: any) =>
            !existingLabels.some((l: any) =>
              Math.abs((l.left || 0) - (s.left || 0) - 8) < 10 &&
              Math.abs((l.top || 0) - (s.top || 0) - 6) < 10
            )
          );
          for (const shoot of shootsWithoutLabel) {
            const idx = shoot._shootIndex || (shoots.indexOf(shoot) + 1);
            const label = new fabric.FabricText(`#${idx}`, {
              left: (shoot.left || 0) + 8,
              top: (shoot.top || 0) + 6,
              originX: "left",
              originY: "top",
              fontSize: 16,
              fontFamily: "sans-serif",
              fontWeight: "bold",
              fill: "#4f46e5",
              selectable: false,
              evented: false,
            });
            (label as any)._isShootLabel = true;
            (label as any)._shootZone = shoot;
            (shoot as any)._shootLabel = label;
            canvas.add(label);
          }
        }

        canvas.requestRenderAll();
        // Restore metadata
        if (initialFrameName) {
          setFrameName(initialFrameName);
        } else {
          try {
            const meta = await loadCanvasState(autoSaveKey + "_meta");
            if (meta) {
              const { frameName: savedName, bgColor: savedBg } = JSON.parse(meta);
              if (savedName) setFrameName(savedName);
              if (savedBg) setBgColor(savedBg);
            }
          } catch { /* ignore */ }
        }
      } finally {
        // Always clear the restore flag, even if loadFromJSON threw —
        // otherwise auto-save and history are blocked forever.
        isRestoringRef.current = false;
      }
    }
  } catch {
    // Swallow; the initial history save below runs in either case
  }

  _restoreSaveHistoryTimer = setTimeout(() => {
    _restoreSaveHistoryTimer = null;
    saveHistory();
  }, 200);
}

