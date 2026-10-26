// @ts-nocheck — extracted from useCanvasInit, implicit any types throughout
/* eslint-disable @typescript-eslint/no-explicit-any */

import LZString from "lz-string";
import { getCheckerCanvas, buildBlobMap, fixBlobUrls } from "../index";
import { CUSTOM_PROPS } from "../types";
import { saveCanvasState } from "./canvasDB";
import {
  computeDiff,
  applyPatch,
  BASE_SNAPSHOT_INTERVAL,
  type CanvasPatch,
  type HistoryEntry,
} from "./jsonDiff";

export type { HistoryEntry } from "./jsonDiff";

// ── History system (saveHistory with image dedup + delta diffs) ──

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function extractImageData(obj: any, cache: Map<string, string>) {
  if (!obj) return;
  if (obj.type === "image" && obj.src && obj.src.startsWith("data:") && obj.src.length > 1000) {
    const src = obj.src;
    const h = src.length < 2000
      ? hashStr(src)
      : hashStr(src.slice(0, 200)) + "_" + hashStr(src.slice(Math.floor(src.length / 2), Math.floor(src.length / 2) + 200)) + "_" + hashStr(src.slice(-200));
    const key = `__img_${src.length}_${h}`;
    if (!cache.has(key)) cache.set(key, src);
    obj.src = key;
  }
  if (obj.objects && Array.isArray(obj.objects)) {
    for (const child of obj.objects) extractImageData(child, cache);
  }
}

/**
 * Resolve a history entry to a full canvas JSON object.
 *
 * For snapshot entries, decompress and parse directly.
 * For delta entries, find the nearest preceding snapshot, then replay
 * deltas forward to reconstruct the target state.
 */
export function resolveHistoryEntry(
  history: HistoryEntry[],
  index: number,
): any {
  const entry = history[index];
  if (!entry) return null;

  if (entry.type === "snapshot") {
    const json = LZString.decompressFromUTF16(entry.data);
    return JSON.parse(json || entry.data);
  }

  // Delta: walk backwards to find the nearest base snapshot
  let baseIdx = index - 1;
  while (baseIdx >= 0 && history[baseIdx].type !== "snapshot") {
    baseIdx--;
  }
  if (baseIdx < 0) {
    // Should not happen in a well-formed history, but treat as fallback:
    // try parsing the first entry regardless
    const raw = LZString.decompressFromUTF16(history[0].data);
    return JSON.parse(raw || history[0].data);
  }

  // Start from the base snapshot and apply deltas forward
  const baseRaw = LZString.decompressFromUTF16(history[baseIdx].data);
  let state = JSON.parse(baseRaw || history[baseIdx].data);

  for (let i = baseIdx + 1; i <= index; i++) {
    const e = history[i];
    if (e.type === "snapshot") {
      // Unexpected snapshot in the middle — use it directly
      const raw = LZString.decompressFromUTF16(e.data);
      state = JSON.parse(raw || e.data);
    } else {
      const patchRaw = LZString.decompressFromUTF16(e.data);
      const patch: CanvasPatch = JSON.parse(patchRaw || e.data);
      if (patch.type === "full") {
        // 'full' sentinel means the diff was too large — the caller stored
        // a full snapshot instead. But it ended up typed as "delta"
        // (shouldn't happen, but be defensive). Treat as snapshot:
        throw new Error("Unexpected full patch in delta entry");
      }
      state = applyPatch(state, patch);
    }
  }

  return state;
}

/** Max undo history entries */
const MAX_HISTORY = 50;

export function createSaveHistory(
  canvas: any,
  BLEED_PX: number,
  canvasWidth: number,
  canvasHeight: number,
  bufferWidth: number,
  bufferHeight: number,
  isRestoringRef: any,
  suppressHistoryRef: any,
  historyRef: any,
  historyIndexRef: any,
  historyImageCacheRef: any,
  frameNameRef: any,
  bgColorRef: any,
  autoSaveKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gabarit: any,
  setHistoryVersion: (fn: (v: number) => number) => void,
  setSaveStatus: (s: string) => void,
  setLastSavedAt: (t: number) => void,
) {
  let restoringStartTime = 0;
  let lastFullJson: any = null;
  let opsSinceBase = 0;
  // For deduplication: hash of last saved state
  let lastJsonHash = "";
  // Throttle image cache pruning — decompressing all history is O(n) and
  // expensive, so we only run it every N saves.
  let savesSinceCachePrune = 0;
  // Bail out of auto-save after consecutive failures so a full quota
  // or corrupted IndexedDB doesn't burn CPU on every save call.
  let autoSaveFailures = 0;
  const MAX_AUTOSAVE_FAILURES = 5;

  /**
   * Reset internal diff state. Must be called after undo/redo so that
   * the next save produces a full snapshot instead of a delta against
   * the stale pre-undo base.
   */
  function resetDiffState() {
    lastFullJson = null;
    opsSinceBase = 0;
    lastJsonHash = "";
  }

  function saveHistory(label?: string) {
    // Skip saving while undo/redo/rollback is loading a state
    if (isRestoringRef.current) return;
    // Stronger gate: format/gabarit changes wrap the entire load + remount
    // in suppressHistoryRef so the per-object Fabric events don't fill the
    // history with N stale entries. One consolidated entry is pushed by
    // useCanvasInit after setReady when pendingFormatTransitionLabel is set.
    if (suppressHistoryRef?.current) return;
    const jsonObj = (canvas as any).toObject(CUSTOM_PROPS);
    // Force-write custom props into JSON (Fabric v7 may ignore _-prefixed props in toJSON)
    const canvasObjs = canvas.getObjects();
    if (jsonObj.objects && canvasObjs.length === jsonObj.objects.length) {
      for (let i = 0; i < canvasObjs.length; i++) {
        const src = canvasObjs[i] as any;
        const dst = jsonObj.objects[i];
        for (const prop of CUSTOM_PROPS) {
          if (src[prop] !== undefined) dst[prop] = src[prop];
        }
      }
    }
    {
      const bm = buildBlobMap(canvas);
      if (jsonObj.objects) {
        for (const o of jsonObj.objects) fixBlobUrls(o, bm);
      }
    }
    if (jsonObj.objects) {
      // Filter out internal/UI-only objects that shouldn't be in history
      jsonObj.objects = jsonObj.objects.filter((o: any) => {
        // Always filter out pure UI objects
        if (o._isDesignAreaBg || o._isGuideline || o._isPenOverlay || o._isPenPreview ||
            o._isFeatherPreview || o._isCropRect || o._isCropOverlay || o._isCropPreview) return false;
        // Keep solid bg if it has a gradient fill or a custom color (not default white)
        if (o._isSolidBg) {
          if (typeof o.fill === "object") return true; // gradient fill
          return o.fill && o.fill !== "#ffffff" && o.fill !== "white" && o.fill !== "transparent";
        }
        return true;
      });
      for (const o of jsonObj.objects) {
        o.left = (o.left || 0) - BLEED_PX;
        o.top = (o.top || 0) - BLEED_PX;
      }
    }
    jsonObj.width = canvasWidth;
    jsonObj.height = canvasHeight;

    if (jsonObj.objects) {
      for (const o of jsonObj.objects) extractImageData(o, historyImageCacheRef.current);
    }

    const json = JSON.stringify(jsonObj);

    // ── Deduplication: skip if state is identical to last save ──
    // Use a full-string hash to catch any differences, including changes
    // in the middle of the JSON (e.g. object reordering, prop tweaks).
    const fullHash = hashStr(json);
    if (fullHash === lastJsonHash && historyRef.current.length > 0) return;
    lastJsonHash = fullHash;

    // ── Decide: store a full snapshot or a delta ──
    const idx = historyIndexRef.current;
    historyRef.current = historyRef.current.slice(0, idx + 1);

    const isFirstEntry = historyRef.current.length === 0;
    const needsBaseSnapshot = isFirstEntry || opsSinceBase >= BASE_SNAPSHOT_INTERVAL - 1;

    let entry: HistoryEntry;

    // Stamp every entry with the current format/gabarit context so undo/redo
    // can detect cross-format transitions (target.formatId !== current
    // format.id ⇒ route through the parent's onChangeGabarit handler rather
    // than an in-place restore that would mismatch canvas dimensions).
    const ctx = {
      formatId: format?.id,
      gabaritId: gabarit?.id,
      format,
      gabarit,
      bufferDims: { width: bufferWidth, height: bufferHeight },
      bleed: BLEED_PX,
    };

    if (needsBaseSnapshot || !lastFullJson) {
      const compressed = LZString.compressToUTF16(json);
      entry = { type: "snapshot", data: compressed, label, timestamp: Date.now(), ...ctx };
      lastFullJson = jsonObj;
      opsSinceBase = 0;
    } else {
      const patch = computeDiff(lastFullJson, jsonObj);
      if (patch.type === "full") {
        const compressed = LZString.compressToUTF16(json);
        entry = { type: "snapshot", data: compressed, label, timestamp: Date.now(), ...ctx };
        opsSinceBase = 0;
      } else {
        const patchJson = JSON.stringify(patch);
        const compressed = LZString.compressToUTF16(patchJson);
        entry = { type: "delta", data: compressed, label, timestamp: Date.now(), ...ctx };
        opsSinceBase++;
      }
      lastFullJson = jsonObj;
    }

    historyRef.current.push(entry);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
      if (historyRef.current.length > 0 && historyRef.current[0].type === "delta") {
        try {
          const resolved = resolveHistoryEntry(historyRef.current, 0);
          const compressed = LZString.compressToUTF16(JSON.stringify(resolved));
          historyRef.current[0] = { type: "snapshot", data: compressed, label: historyRef.current[0].label };
        } catch { /* defensive fallback */ }
      }
    }
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryVersion((v: number) => v + 1);

    // Prune image cache — only run every 10 saves because decompressing
    // the entire history is O(n) and can get slow on long sessions.
    savesSinceCachePrune++;
    if (historyImageCacheRef.current.size > 50 && savesSinceCachePrune >= 10) {
      savesSinceCachePrune = 0;
      const allHistory = historyRef.current.map((e: HistoryEntry) => LZString.decompressFromUTF16(e.data) || "").join("");
      const cache = historyImageCacheRef.current as Map<string, string>;
      for (const key of cache.keys()) {
        if (!allHistory.includes(key)) cache.delete(key);
      }
    }

    // Auto-save to IndexedDB (fire-and-forget). We track consecutive
    // failures so a full quota or corrupted DB doesn't keep retrying
    // forever and consuming CPU every save. After 5 failures in a row
    // we stop trying for this session and log a single warning.
    const now = Date.now();
    try {
      const fullJsonObj = JSON.parse(json);
      if (fullJsonObj.objects) {
        const restore = (o: any) => {
          if (o?.type === "image" && o.src?.startsWith("__img_")) {
            const d = historyImageCacheRef.current.get(o.src);
            if (d) o.src = d;
          }
          if (o?.objects) o.objects.forEach(restore);
        };
        fullJsonObj.objects.forEach(restore);
      }
      const fullJson = JSON.stringify(fullJsonObj);
      if (autoSaveFailures < MAX_AUTOSAVE_FAILURES) {
        saveCanvasState(autoSaveKey, fullJson)
          .then(() => { autoSaveFailures = 0; })
          .catch(() => {
            autoSaveFailures++;
            if (autoSaveFailures === MAX_AUTOSAVE_FAILURES) {
              console.warn("Auto-save disabled after 5 consecutive failures (quota or IndexedDB issue)");
            }
          });
        saveCanvasState(
          autoSaveKey + "_meta",
          JSON.stringify({ frameName: frameNameRef.current, bgColor: bgColorRef.current, savedAt: now }),
        ).catch(() => {});
      }
    } catch (err: any) {
      if (err?.name === "QuotaExceededError" || err?.code === 22) {
        console.warn("localStorage quota exceeded, auto-save skipped");
      }
    }
    setLastSavedAt(now);
  }

  // Attach resetDiffState to the canvas so undo/redo can call it
  (canvas as any)._resetHistoryDiffState = resetDiffState;

  return saveHistory;
}

// ── Smart repositioning from previous format ──
//
// Loads user elements from the previous canvas into the NEW gabarit canvas
// without wiping existing objects (solidBg, shoot zones, text guides).
// Each element is proportionally scaled and repositioned based on the
// ratio between old and new canvas dimensions.
//
// IMPORTANT: positions in the JSON are in BUFFER space (include BLEED_PX).
// We must strip old bleed, work in design-space, then add new bleed.

const BLEED_PX_MIN = 150;
const BLEED_PX_MAX = 400;
function computeBleed(w: number, h: number) {
  return Math.min(BLEED_PX_MAX, Math.max(BLEED_PX_MIN, Math.round(Math.max(w, h) * 0.25)));
}

export async function smartRepositionFromPreviousFormat(
  canvas: any,
  fabric: any,
  previousCanvasState: string,
  previousDimensions: { width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  BLEED_PX: number,
  _gabarit: any,
) {
  try {
    const prevJson = JSON.parse(previousCanvasState);
    const prevW = previousDimensions.width;
    const prevH = previousDimensions.height;
    const prevBleed = computeBleed(prevW, prevH);
    const newW = canvasWidth;
    const newH = canvasHeight;
    const scaleX = newW / prevW;
    const scaleY = newH / prevH;
    // Geometric mean — reversible: A→B→A gives scale 1 (unlike Math.min
    // which always shrinks when aspect ratios differ).
    const uniformScale = Math.sqrt(scaleX * scaleY);

    // ── Catalogue verbatim path ──
    // When the previous state came from a catalogue (Selfizee booth) load,
    // PanelModeles tags each object with `_fromCatalogue`. Two sub-paths:
    //   - "Remplacer le design" (applyCatalogueModel pre-scaled to BUFFER):
    //     prevDims == newBuffer. We want the catalogue's full design,
    //     including its creu_<n> shoots. Wipe defaults, take everything.
    //   - "Changer de format" of a catalogue creation:
    //     prevDims != newBuffer. User asked for the NEW gabarit's shoots
    //     instead of the source catalogue's, so keep the defaults that
    //     useCanvasInit/createShootZones added and filter shoots out of
    //     the incoming JSON.
    const isCatalogueLoad = (prevJson.objects || []).some((o: any) => o._fromCatalogue);
    const newBufferW = canvasWidth + 2 * BLEED_PX;
    const newBufferH = canvasHeight + 2 * BLEED_PX;
    const isCataloguePreScaled = isCatalogueLoad && prevW === newBufferW && prevH === newBufferH;
    if (isCatalogueLoad) {
      // Drop default solidBg + designAreaBg — the catalogue ships its
      // own cadre rect either way. The shoots/labels we drop only on
      // the pre-scaled path; on the format-change path we keep the new
      // gabarit's defaults and filter the source ones out of prevJson.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toRemove = canvas.getObjects().filter((o: any) =>
        o._isSolidBg || o._isDesignAreaBg
        || (isCataloguePreScaled && (o._isShootZone || o._isShootLabel)),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toRemove.forEach((o: any) => canvas.remove(o));

      const allObjs = (prevJson.objects || []).filter((o: any) => {
        if (!o || o._isTextGuide) return false;
        // Format-change path: keep cadre / decorations / user text, drop
        // the source catalogue's shoots so the new gabarit's defaults win.
        if (!isCataloguePreScaled && (o._isShootZone || o._isShootLabel)) return false;
        return true;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enlivened: any[] = await fabric.util.enlivenObjects(allObjs);
      for (let i = 0; i < enlivened.length; i++) {
        const src = allObjs[i];
        const obj = enlivened[i] as any;
        // Preserve every custom property on the live object.
        for (const prop of CUSTOM_PROPS) {
          if (src[prop] !== undefined) obj[prop] = src[prop];
        }
        // The shoot rects authored by the booth are unlocked + free-fill
        // by default. Re-apply the studio's locking + checker-pattern fill
        // so they behave like native shoots and show the photo placeholder.
        if (obj._isShootZone) {
          // Counter-scale the checker pattern so the tiles stay square
          // even when the rect has uneven scaleX/scaleY (panoramic shoots).
          const pattern = new fabric.Pattern({
            source: getCheckerCanvas(),
            repeat: "repeat",
            patternTransform: [1 / (obj.scaleX || 1), 0, 0, 1 / (obj.scaleY || 1), 0, 0],
          });
          obj.set({
            fill: pattern,
            stroke: "",
            strokeWidth: 0,
            strokeDashArray: null,
            selectable: true,
            evented: true,
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
            hasControls: false,
            hoverCursor: "pointer",
            noScaleCache: true,
          });
        }
        if (obj._isSolidBg) {
          // Stretch the cadre rect to EXACTLY cover the design area —
          // no thin white gap at the edges from aspect-ratio rounding.
          // The new canvas's design area lives at (BLEED_PX, BLEED_PX)
          // with size (canvasWidth, canvasHeight), same convention as
          // createCanvas's initBg.
          obj.set({
            left: BLEED_PX,
            top: BLEED_PX,
            width: canvasWidth,
            height: canvasHeight,
            scaleX: 1,
            scaleY: 1,
            selectable: false,
            evented: false,
            hoverCursor: "default",
          });
        }
        // Shoot labels (#1, #2, …) round-trip through JSON but lose their
        // cross-object references — _shootLabel and _shootZone link two live
        // Fabric objects, which toObject can't serialize. Without re-linking,
        // moving a shoot in this canvas leaves its label stuck where it was.
        // Force the labels back to non-interactive too, in case serialization
        // re-applied Fabric's defaults (selectable/evented = true).
        if (obj._isShootLabel) {
          obj.set({ selectable: false, evented: false });
        }
        canvas.add(obj);
        obj.setCoords();
      }
      // Safety net: if the saved snapshot didn't include a solidBg (saveHistory
      // filters out default-white solidBg before stamping), we'd be left
      // with no background after dropping the default created by
      // createCanvas above. Re-add a white one so the canvas isn't
      // visually transparent.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasSolidBg = canvas.getObjects().some((o: any) => o._isSolidBg);
      if (!hasSolidBg) {
        const dBg = new fabric.Rect({
          left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight,
          fill: "#ffffff", originX: "left", originY: "top",
          selectable: false, evented: false, hoverCursor: "default",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (dBg as any)._isSolidBg = true;
        canvas.add(dBg);
      }
      // Re-link each shoot zone to its label by spatial proximity — labels
      // are authored at (shoot.left + 8, shoot.top + 6) (see createShootZones).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shoots = canvas.getObjects().filter((o: any) => o._isShootZone);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const labels = canvas.getObjects().filter((o: any) => o._isShootLabel);
      shoots.forEach((shoot: any) => {
        const lbl = labels.find(
          (l: any) =>
            Math.abs((l.left || 0) - (shoot.left || 0) - 8) < 5 &&
            Math.abs((l.top || 0) - (shoot.top || 0) - 6) < 5,
        );
        if (lbl) {
          shoot._shootLabel = lbl;
          lbl._shootZone = shoot;
        }
      });
      // The cadre _isSolidBg sits at the back so design overlays render on top.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
      if (solidBg) canvas.sendObjectToBack(solidBg);
      canvas.requestRenderAll();
      return;
    }

    // ── 1. Restore background colour / gradient ──
    // Always apply the saved fill if a solidBg is present in the snapshot,
    // regardless of whether the value matches the "default" sentinel set.
    // The user noticed that a Portrait → Paysage "Charger les éléments
    // existants" with a black background sometimes ended up transparent or
    // white on the new canvas — the previous guard (`!isDefault`) skipped
    // any fill that didn't pass the exact-match list, so non-canonical
    // representations of the same colour leaked through.
    const prevSolidBg = (prevJson.objects || []).find((o: any) => o._isSolidBg);
    if (prevSolidBg && prevSolidBg.fill !== undefined && prevSolidBg.fill !== null) {
      const solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
      if (solidBg) solidBg.set("fill", prevSolidBg.fill);
    }

    // ── 2. Extract user-created objects only ──
    const userObjects = (prevJson.objects || []).filter(
      (o: any) => !o._isShootZone && !o._isShootLabel && !o._isTextGuide && !o._isSolidBg && !o._isDesignAreaBg
        && !(o.strokeDashArray && o.strokeDashArray.length > 0),
    );
    if (userObjects.length === 0) {
      canvas.requestRenderAll();
      return;
    }

    // ── 3. Pre-scale each serialised object before deserialising ──
    for (const obj of userObjects) {
      // Strip old BLEED to get design-space coordinates
      const dsLeft = (obj.left || 0) - prevBleed;
      const dsTop = (obj.top || 0) - prevBleed;
      const objW = (obj.width || 0) * (obj.scaleX || 1);
      const objH = (obj.height || 0) * (obj.scaleY || 1);
      const objCx = dsLeft + (obj.originX === "center" ? 0 : objW / 2);
      const objCy = dsTop + (obj.originY === "center" ? 0 : objH / 2);

      const wasCovering = objW > prevW * 0.85 && objH > prevH * 0.85;
      const wasCenteredX = Math.abs(objCx - prevW / 2) < prevW * 0.08;
      const wasCenteredY = Math.abs(objCy - prevH / 2) < prevH * 0.08;
      const wasNearBottom = Math.abs(dsTop + objH - prevH) < prevH * 0.08;

      if (wasCovering) {
        const coverScale = Math.max(newW / (obj.width || 1), newH / (obj.height || 1));
        obj.scaleX = coverScale;
        obj.scaleY = coverScale;
        obj.left = BLEED_PX;
        obj.top = BLEED_PX;
        obj.originX = "left";
        obj.originY = "top";
      } else {
        // Proportional scale (via scaleX/scaleY only — don't touch fontSize
        // or it double-scales since visual size = fontSize * scaleY)
        obj.scaleX = (obj.scaleX || 1) * uniformScale;
        obj.scaleY = (obj.scaleY || 1) * uniformScale;

        if (obj.strokeWidth && obj.strokeWidth > 0) obj.strokeWidth = obj.strokeWidth * uniformScale;
        if (obj.rx) obj.rx = obj.rx * uniformScale;
        if (obj.ry) obj.ry = obj.ry * uniformScale;

        const newObjW = (obj.width || 0) * (obj.scaleX || 1);
        const newObjH = (obj.height || 0) * (obj.scaleY || 1);

        // Position: relative placement in design space
        let newLeft, newTop;
        if (wasCenteredX) {
          newLeft = obj.originX === "center" ? newW / 2 : newW / 2 - newObjW / 2;
        } else {
          const relX = objCx / prevW;
          newLeft = obj.originX === "center" ? relX * newW : relX * newW - newObjW / 2;
        }
        if (wasCenteredY) {
          newTop = obj.originY === "center" ? newH / 2 : newH / 2 - newObjH / 2;
        } else if (wasNearBottom) {
          newTop = obj.originY === "center" ? newH - newObjH / 2 : newH - newObjH;
        } else {
          const relY = objCy / prevH;
          newTop = obj.originY === "center" ? relY * newH : relY * newH - newObjH / 2;
        }

        // Clamp within design area
        if (obj.originX !== "center") newLeft = Math.max(-newObjW * 0.5, Math.min(newW - newObjW * 0.5, newLeft));
        if (obj.originY !== "center") newTop = Math.max(-newObjH * 0.5, Math.min(newH - newObjH * 0.5, newTop));

        // Add NEW bleed to get buffer-space coords
        obj.left = newLeft + BLEED_PX;
        obj.top = newTop + BLEED_PX;
      }
    }

    // ── 4. Deserialise and add to canvas ──
    const enlivened: any[] = await fabric.util.enlivenObjects(userObjects);
    for (const obj of enlivened) {
      canvas.add(obj);
    }

    // Restore custom props that enlivenObjects may have dropped
    for (let i = 0; i < enlivened.length; i++) {
      const src = userObjects[i];
      const obj = enlivened[i] as any;
      for (const prop of CUSTOM_PROPS) {
        if (src[prop] !== undefined) obj[prop] = src[prop];
      }
      if (obj._locked) {
        obj.set({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false, hoverCursor: "default" });
      }
      if (obj.initDimensions) obj.initDimensions();
      obj.setCoords();
    }

    // Re-assert z-order: solidBg / designAreaBg stay pinned to the back,
    // bg images sit just above them. Shoot zones + labels are NOT forced
    // to the top anymore — the user reported that elements that were
    // above the old shoots should stay above the new gabarit's shoots
    // after "Charger les éléments existants". canvas.add already places
    // user objects on top, so leaving shoots where useCanvasInit's
    // createShootZones put them (low in the stack) preserves the
    // original above-shoots layering. Only UI-only overlays (text
    // guides, pen/lasso previews) stay pinned on top.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pinnedBg = canvas.getObjects().filter((o: any) => o._isSolidBg || o._isDesignAreaBg);
    [...pinnedBg].reverse().forEach((o: any) => canvas.sendObjectToBack(o));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgImages = canvas.getObjects().filter((o: any) => o._isBgImage);
    bgImages.forEach((o: any) => {
      // Position just above the last pinned bg (solidBg + designAreaBg).
      canvas.sendObjectToBack(o);
      for (let k = 0; k < pinnedBg.length; k++) canvas.bringObjectForward(o);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topLayer = canvas.getObjects().filter((o: any) =>
      o._isTextGuide || o._isGuideline || o._isPenOverlay || o._isPenPreview || o._isFeatherPreview,
    );
    topLayer.forEach((o: any) => canvas.bringObjectToFront(o));

    canvas.requestRenderAll();
  } catch (err) {
    console.error("Smart repositioning error:", err);
  }
}
