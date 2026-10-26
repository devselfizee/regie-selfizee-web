/**
 * JSON diff utilities for the canvas undo/redo system.
 *
 * Instead of storing full canvas snapshots on every action, we compute
 * minimal diffs (patches) between consecutive states.  A full base
 * snapshot is stored periodically so that any state can be reconstructed
 * by replaying a short chain of deltas on top of the nearest base.
 *
 * The matching heuristic is tuned for fabric.js canvas JSON where
 * objects have stable types and positions between edits.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Types ──

export interface CanvasPatch {
  type: "full" | "delta";
  /** Objects added to the canvas (with target index + full object JSON). */
  added?: { index: number; obj: any }[];
  /** Indices (in the *from* array) of objects that were removed. */
  removed?: number[];
  /** Per-object property changes (index refers to position in *to* array). */
  modified?: { index: number; props: Record<string, any> }[];
  /** Canvas-level property changes (background, width, height, ...). */
  meta?: Record<string, any>;
}

export interface HistoryEntry {
  type: "snapshot" | "delta";
  /** LZ-compressed JSON string — either full canvas state or a CanvasPatch. */
  data: string;
  /** Human-readable label describing what changed (e.g. "Texte modifié"). */
  label?: string;
  /** Timestamp when this entry was created */
  timestamp?: number;
  // ── Format/gabarit context captured at save time ──
  // undo/redo compare the target entry's formatId/gabaritId with the
  // current mount's format. A mismatch means restoring this entry would
  // load a JSON sized for a different canvas — so instead of an in-place
  // restore we route through the parent's onChangeGabarit handler, which
  // triggers a remount with previousCanvasState = the target JSON.
  formatId?: string;
  gabaritId?: string;
  /** Full Format and Gabarit objects so a cross-format restore can rehydrate
   *  the new mount without an extra lookup. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gabarit?: any;
  /** Buffer dimensions (canvas + bleed) at save time — passed to
   *  previousDimensions on a cross-format restore so smartReposition runs
   *  as a no-op. */
  bufferDims?: { width: number; height: number };
  /** BLEED_PX at save time. saveHistory strips it from positions
   *  (objects stored in design-space); a cross-format restore has to
   *  add it back before handing the JSON to smartRepositionFromPreviousFormat,
   *  which expects buffer-space positions. */
  bleed?: number;
}

// ── Constants ──

/** Store a full snapshot every N operations. */
export const BASE_SNAPSHOT_INTERVAL = 10;

// ── Diff / Patch ──

/**
 * Compute a minimal diff that transforms `fromJson` into `toJson`.
 *
 * Objects are matched by type + spatial/content proximity.  When the
 * diff would be too large (>60 % of objects changed, or big length
 * delta) we return a `{ type: 'full' }` sentinel — the caller should
 * fall back to storing a full snapshot.
 */
export function computeDiff(fromJson: any, toJson: any): CanvasPatch {
  const fromObjs: any[] = fromJson.objects || [];
  const toObjs: any[] = toJson.objects || [];

  // Quick check: if object count changed significantly, use full snapshot
  if (Math.abs(fromObjs.length - toObjs.length) > 5) {
    return { type: "full" };
  }

  const added: { index: number; obj: any }[] = [];
  const removed: number[] = [];
  const modified: { index: number; props: Record<string, any> }[] = [];

  // For each object in `to`, find the best match in `from`.
  // matchMap[toIndex] = fromIndex (or -1 if added)
  const matched = new Set<number>();
  const matchMap: number[] = new Array(toObjs.length).fill(-1);

  for (let i = 0; i < toObjs.length; i++) {
    const to = toObjs[i];
    let bestMatch = -1;
    let bestScore = 0;

    for (let j = 0; j < fromObjs.length; j++) {
      if (matched.has(j)) continue;
      const from = fromObjs[j];
      if (from.type !== to.type) continue;

      let score = 1;
      if (
        Math.abs((from.left || 0) - (to.left || 0)) < 5 &&
        Math.abs((from.top || 0) - (to.top || 0)) < 5
      )
        score += 10;
      if (from.src === to.src) score += 5;
      if (from.text === to.text) score += 5;
      if (from._isShootZone === to._isShootZone) score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = j;
      }
    }

    if (bestMatch >= 0 && bestScore >= 3) {
      matched.add(bestMatch);
      matchMap[i] = bestMatch;

      // Compute property diff
      const propDiff: Record<string, any> = {};
      const from = fromObjs[bestMatch];
      let hasChanges = false;

      for (const key of Object.keys(to)) {
        if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
          propDiff[key] = to[key];
          hasChanges = true;
        }
      }
      for (const key of Object.keys(from)) {
        if (!(key in to)) {
          propDiff[key] = undefined;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        modified.push({ index: i, props: propDiff });
      }
    } else {
      added.push({ index: i, obj: to });
    }
  }

  // Objects in `from` that weren't matched are removals.
  for (let j = 0; j < fromObjs.length; j++) {
    if (!matched.has(j)) removed.push(j);
  }

  // Detect reordering: check if matched from-indices maintain relative order.
  // The delta system cannot represent object reordering (e.g. layer order changes),
  // so we must fall back to a full snapshot when objects were reordered.
  {
    let lastFromIdx = -1;
    for (let i = 0; i < toObjs.length; i++) {
      if (matchMap[i] < 0) continue; // skip added objects
      if (matchMap[i] < lastFromIdx) {
        return { type: "full" }; // reordering detected
      }
      lastFromIdx = matchMap[i];
    }
  }

  // If diff is too large, fall back to full snapshot.
  // Only apply this heuristic when there are enough objects to be meaningful —
  // with very few objects even a single legitimate change would exceed 60%
  // and force an unnecessary full snapshot. Reordering detection above is
  // already independent and handles any number of objects correctly.
  const maxLen = Math.max(fromObjs.length, toObjs.length, 1);
  const changeCount = added.length + removed.length + modified.length;
  if (maxLen >= 5 && changeCount > maxLen * 0.6) {
    return { type: "full" };
  }

  const patch: CanvasPatch = { type: "delta" };
  if (added.length) patch.added = added;
  if (removed.length) patch.removed = removed;
  if (modified.length) patch.modified = modified;

  // Canvas-level meta changes
  const meta: Record<string, any> = {};
  for (const key of ["background", "width", "height"]) {
    if (JSON.stringify(fromJson[key]) !== JSON.stringify(toJson[key])) {
      meta[key] = toJson[key];
    }
  }
  if (Object.keys(meta).length) patch.meta = meta;

  return patch;
}

/**
 * Apply a delta patch to a base canvas JSON, producing a new canvas JSON.
 *
 * Throws if `patch.type` is `'full'` — full patches are a signal that
 * the caller should use the stored full state directly.
 */
export function applyPatch(baseJson: any, patch: CanvasPatch): any {
  if (patch.type === "full") {
    throw new Error("Cannot apply full patch — use the stored full state");
  }

  const result = JSON.parse(JSON.stringify(baseJson));
  const objs: any[] = result.objects ? [...result.objects] : [];

  // 1. Remove objects (reverse order to keep indices stable)
  if (patch.removed) {
    for (const idx of [...patch.removed].sort((a, b) => b - a)) {
      objs.splice(idx, 1);
    }
  }

  // 2. Add new objects (ascending index order so splices don't shift).
  // Adds must happen BEFORE modifies because `modified[].index` refers
  // to positions in the *to* array, i.e. after additions are in place.
  if (patch.added) {
    const sorted = [...patch.added].sort((a, b) => a.index - b.index);
    for (const add of sorted) {
      objs.splice(add.index, 0, add.obj);
    }
  }

  // 3. Modify objects (indices now match `to` array positions)
  if (patch.modified) {
    for (const mod of patch.modified) {
      if (objs[mod.index]) {
        for (const [key, value] of Object.entries(mod.props)) {
          if (value === undefined) {
            delete objs[mod.index][key];
          } else {
            objs[mod.index][key] = value;
          }
        }
      }
    }
  }

  // 4. Apply meta changes
  if (patch.meta) {
    Object.assign(result, patch.meta);
  }

  result.objects = objs;
  return result;
}

/** Approximate serialised size of a patch (bytes). */
export function patchSize(patch: CanvasPatch): number {
  return JSON.stringify(patch).length;
}
