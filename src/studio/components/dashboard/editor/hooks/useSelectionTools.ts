"use client";

import { useCallback } from "react";
import { ensureCleanElement } from "../canvas/canvasUtils";

/* ═══════════════════════════════════════════════════════════════
   Selection tools — select area + wand selection popup.
   ═══════════════════════════════════════════════════════════════ */

interface UseSelectionToolsParams {
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  displayScaleRef: React.MutableRefObject<number>;
  canvasWrapperRef: React.RefObject<HTMLDivElement | null>;
  selectedObj: any;
  setSelectedObj: (v: any) => void;
  isRestoringRef: React.MutableRefObject<boolean>;
  selectAreaActiveRef: React.MutableRefObject<boolean>;
  setSelectAreaActive: (v: boolean) => void;
  selectAreaTargetRef: React.MutableRefObject<any>;
  selectAreaStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  selectAreaPointsRef: React.MutableRefObject<{ x: number; y: number }[]>;
  selectAreaPreviewRef: React.MutableRefObject<any[]>;
  selectAreaMode: "rect" | "free";
  setSelectAreaMode: (v: "rect" | "free") => void;
  setWandPopup: (v: any) => void;
  cleanupTools: () => void;
}

export function useSelectionTools({
  fabricRef, canvasWidth, canvasHeight, BLEED_PX, displayScaleRef,
  canvasWrapperRef, selectedObj, setSelectedObj, isRestoringRef,
  selectAreaActiveRef, setSelectAreaActive, selectAreaTargetRef,
  selectAreaStartRef, selectAreaPointsRef, selectAreaPreviewRef,
  selectAreaMode, setSelectAreaMode, setWandPopup, cleanupTools,
}: UseSelectionToolsParams) {
  const startSelectArea = useCallback((mode: "rect" | "free") => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObj || selectedObj.type !== "image") return;
    const targetImg = selectedObj;
    selectAreaTargetRef.current = targetImg;
    selectAreaPointsRef.current = [];
    selectAreaStartRef.current = null;
    setSelectAreaMode(mode);
    setSelectAreaActive(true);

    // Disable all objects + fabric selection box
    canvas.selection = false;
    canvas.skipTargetFind = true;
    // Block rubber-band on every mouse:down during zone selection
    const blockSelection = () => { (canvas as any)._groupSelector = null; };
    canvas.on("mouse:down:before", blockSelection);
    canvas.getObjects().forEach((o: any) => {
      o._selAreaSavedEvented = o.evented; o._selAreaSavedSelectable = o.selectable;
      o.evented = false; o.selectable = false;
    });
    canvas.defaultCursor = "crosshair";
    canvas.hoverCursor = "crosshair";
    canvas.setCursor("crosshair");
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    let isDrawing = false;
    // Note: modeRef is not a React ref — it's a local variable that captures
    // `mode` at the time startSelectArea is called. Since it's created inside
    // a callback (not a component render), it won't be recreated on each render.
    // This is intentional: the mode is fixed for the duration of one selection gesture.
    const modeRef = { current: mode };

    const cleanup = () => {
      setSelectAreaActive(false);
      selectAreaPreviewRef.current.forEach(o => canvas.remove(o));
      selectAreaPreviewRef.current = [];
      // Remove overlay canvas
      overlayCanvas.remove();
      canvas.selection = true;
      canvas.skipTargetFind = false;
      canvas.getObjects().forEach((o: any) => {
        if (o._selAreaSavedEvented !== undefined) { o.evented = o._selAreaSavedEvented; delete o._selAreaSavedEvented; }
        if (o._selAreaSavedSelectable !== undefined) { o.selectable = o._selAreaSavedSelectable; delete o._selAreaSavedSelectable; }
      });
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      canvas.off("mouse:down", onDown);
      canvas.off("mouse:move", onMove);
      canvas.off("mouse:up", onUp);
      canvas.off("mouse:down:before", blockSelection);
    };
    (canvas as any)._selAreaCleanup = cleanup;

    // Convert mouse event to CSS coords relative to the wrapper
    const toCssCoords = (evt: MouseEvent) => {
      const r = wrapperEl?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: evt.clientX - r.left, y: evt.clientY - r.top };
    };

    const onDown = (e: any) => {
      if (!selectAreaActiveRef.current) return;
      e.e.preventDefault();
      e.e.stopPropagation();
      (canvas as any)._groupSelector = null;
      (canvas as any)._currentTransform = null;
      const pointer = toCssCoords(e.e);
      selectAreaStartRef.current = pointer;
      selectAreaPointsRef.current = [pointer];
      isDrawing = true;
    };

    // Create an overlay canvas for the selection preview (avoids fabric.js issues)
    // Append to Fabric's own wrapper so it sits above the upper-canvas
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;z-index:500;";
    const fabricWrapper = canvas.wrapperEl;
    const wrapperEl = canvasWrapperRef.current;
    const appendTarget = fabricWrapper || wrapperEl;
    if (appendTarget) {
      const rect = appendTarget.getBoundingClientRect();
      overlayCanvas.width = Math.round(rect.width);
      overlayCanvas.height = Math.round(rect.height);
      overlayCanvas.style.width = `${rect.width}px`;
      overlayCanvas.style.height = `${rect.height}px`;
      appendTarget.appendChild(overlayCanvas);
    }

    const drawOverlay = () => {
      const octx = overlayCanvas.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      const pts = selectAreaPointsRef.current;

      if (modeRef.current === "rect" && pts.length === 2) {
        // Rectangle mode: draw rectangle from 2 corner points
        const x = Math.min(pts[0].x, pts[1].x);
        const y = Math.min(pts[0].y, pts[1].y);
        const w = Math.abs(pts[1].x - pts[0].x);
        const h = Math.abs(pts[1].y - pts[0].y);
        if (w > 2 && h > 2) {
          octx.fillStyle = "rgba(124,58,237,0.15)";
          octx.fillRect(x, y, w, h);
          octx.strokeStyle = "#4f46e5";
          octx.lineWidth = 1.5;
          octx.strokeRect(x, y, w, h);
        }
      } else if (pts.length > 2) {
        // Free mode: filled area + stroke on drawn path
        octx.beginPath();
        octx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
        octx.closePath();
        octx.fillStyle = "rgba(124,58,237,0.15)";
        octx.fill();
        // Stroke on drawn path only (no closing line)
        octx.beginPath();
        octx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
        octx.strokeStyle = "#4f46e5";
        octx.lineWidth = 1.5;
        octx.stroke();
        // Origin point — large circle (same style as magnetic lasso)
        const ox = pts[0].x, oy = pts[0].y;
        octx.beginPath();
        octx.arc(ox, oy, 14, 0, Math.PI * 2);
        octx.strokeStyle = "#4f46e5";
        octx.lineWidth = 2.5;
        octx.stroke();
        octx.beginPath();
        octx.arc(ox, oy, 5, 0, Math.PI * 2);
        octx.fillStyle = "#4f46e5";
        octx.fill();
        octx.strokeStyle = "#ffffff";
        octx.lineWidth = 1.5;
        octx.stroke();
      }
    };

    const onMove = (e: any) => {
      if (!selectAreaActiveRef.current || !isDrawing || !selectAreaStartRef.current) return;
      const pointer = toCssCoords(e.e);

      if (modeRef.current === "rect") {
        selectAreaPointsRef.current = [selectAreaStartRef.current, pointer];
      } else {
        selectAreaPointsRef.current.push(pointer);
      }
      drawOverlay();
    };

    const onUp = async (e: any) => {
      if (!selectAreaActiveRef.current || !isDrawing || !selectAreaStartRef.current) return;
      isDrawing = false;
      const pointer = selectAreaPointsRef.current[selectAreaPointsRef.current.length - 1];
      if (!pointer) return;

      const fabric = await import("fabric");
      const scale = displayScaleRef.current;
      const imgW = targetImg.width || 1, imgH = targetImg.height || 1;
      const oX = targetImg.originX || "left", oY = targetImg.originY || "top";

      // ─── Coordinate spaces used below ─────────────────────────────────
      //
      //   css space       — pixels within the wrapper element (what the
      //                     mouse events give us). scale = displayScale,
      //                     so (cssPx / scale, cssPy / scale) gives
      //                     canvas-space (buffer) pixels.
      //
      //   canvas space    — Fabric canvas pixel coords.
      //
      //   object-local    — coords relative to the target image's origin,
      //                     after undoing translate/rotate/scale/flip.
      //
      //   centered-pixel  — the selection popup's path storage format:
      //                     image pixels with (0,0) at the image centre,
      //                     i.e. range (-w/2..+w/2, -h/2..+h/2). The
      //                     popup converts these back to top-left pixels
      //                     by adding w/2, h/2 when building Path2D.
      //
      // To handle rotation, flipX/flipY and arbitrary origin, we invert
      // the target's full transform matrix instead of the previous naive
      // top-left/scale subtraction (which was wrong for any rotated img).
      // ──────────────────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matrix = targetImg.calcTransformMatrix();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invMatrix = (fabric as any).util.invertTransform(matrix);

      // Origin offset: converts object-local coords (which are relative
      // to originX/originY) to top-left-of-image pixel coords.
      const originOffsetX = oX === "center" ? imgW / 2 : oX === "right" ? imgW : 0;
      const originOffsetY = oY === "center" ? imgH / 2 : oY === "bottom" ? imgH : 0;

      const toClip = (cssPx: number, cssPy: number) => {
        // css → canvas space
        const bufX = cssPx / scale;
        const bufY = cssPy / scale;
        // canvas → object-local (handles rotate, scale, flip)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const local = (fabric as any).util.transformPoint({ x: bufX, y: bufY }, invMatrix);
        // object-local → top-left pixel → centered pixel
        const pxX = local.x + originOffsetX;
        const pxY = local.y + originOffsetY;
        return { x: pxX - imgW / 2, y: pxY - imgH / 2 };
      };

      let pathD = "";
      if (modeRef.current === "rect") {
        const s = selectAreaStartRef.current;
        const x1 = Math.min(s.x, pointer.x), y1 = Math.min(s.y, pointer.y);
        const x2 = Math.max(s.x, pointer.x), y2 = Math.max(s.y, pointer.y);
        if (Math.abs(x2 - x1) < 5 || Math.abs(y2 - y1) < 5) { selectAreaStartRef.current = null; return; }
        const tl = toClip(x1, y1), tr = toClip(x2, y1), br = toClip(x2, y2), bl = toClip(x1, y2);
        pathD = `M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`;
      } else {
        const pts = selectAreaPointsRef.current;
        if (pts.length < 10) { selectAreaStartRef.current = null; return; }
        const smooth = (arr: {x:number;y:number}[], win: number) => {
          if (arr.length < win) return arr;
          return arr.map((_, i) => { let ax = 0, ay = 0, c = 0; for (let j = -Math.floor(win/2); j <= Math.floor(win/2); j++) { const idx = Math.max(0, Math.min(arr.length - 1, i + j)); ax += arr[idx].x; ay += arr[idx].y; c++; } return { x: ax / c, y: ay / c }; });
        };
        const smoothed = smooth(smooth(pts, 5), 7);
        const centered = smoothed.map(p => toClip(p.x, p.y));
        pathD = `M ${centered[0].x} ${centered[0].y}`;
        for (let i = 1; i < centered.length; i++) pathD += ` L ${centered[i].x} ${centered[i].y}`;
        pathD += " Z";
      }

      cleanup();
      // Use shared popup (same as wand) — highlight + actions
      const wrapRect = canvasWrapperRef.current?.getBoundingClientRect();
      const cx = e?.e?.clientX ?? (wrapRect ? wrapRect.left + wrapRect.width / 2 : window.innerWidth / 2);
      const cy = e?.e?.clientY ?? (wrapRect ? wrapRect.top + wrapRect.height / 2 : window.innerHeight / 2);
      showSelectionPopup(targetImg, pathD, cx, cy);
    };

    canvas.on("mouse:down", onDown);
    canvas.on("mouse:move", onMove);
    canvas.on("mouse:up", onUp);
  }, [selectedObj]);


  const showSelectionPopup = useCallback(async (targetImg: any, pathD: string, clickX?: number, clickY?: number) => {
    const canvas = fabricRef.current;
    if (!canvas || !targetImg) return;

    // If a previous selection highlight is still being restored, wait for it
    // This prevents capturing the highlight image as the "original" source.
    // Bounded to 100 iterations (~5s at 50ms) so we never busy-wait forever
    // if the restore flag gets stuck (e.g. a prior error path).
    if ((targetImg as any)._restoringOriginal) {
      await new Promise<void>(r => {
        let tries = 0;
        const MAX_TRIES = 100;
        const check = () => {
          if (!(targetImg as any)._restoringOriginal) { r(); return; }
          if (++tries >= MAX_TRIES) {
            console.warn("showSelectionPopup: gave up waiting for _restoringOriginal after", MAX_TRIES, "tries");
            r();
            return;
          }
          setTimeout(check, 50);
        };
        check();
      });
    }

    const imgEl = targetImg.getElement();
    if (!imgEl) return;
    const w = imgEl.naturalWidth || imgEl.width;
    const h = imgEl.naturalHeight || imgEl.height;

    // Build a Path2D from the clip path (centered coords → top-left coords)
    const buildPath2D = () => {
      const p = new Path2D();
      // Parse the pathD manually
      const parts = pathD.match(/[MLCQZz][^MLCQZz]*/g) || [];
      for (const part of parts) {
        const cmd = part[0];
        const nums = part.slice(1).trim().split(/[\s,]+/).map(Number);
        if (cmd === "M") p.moveTo(nums[0] + w / 2, nums[1] + h / 2);
        else if (cmd === "L") p.lineTo(nums[0] + w / 2, nums[1] + h / 2);
        else if (cmd === "C") p.bezierCurveTo(nums[0]+w/2, nums[1]+h/2, nums[2]+w/2, nums[3]+h/2, nums[4]+w/2, nums[5]+h/2);
        else if (cmd === "Q") p.quadraticCurveTo(nums[0]+w/2, nums[1]+h/2, nums[2]+w/2, nums[3]+h/2);
        else if (cmd === "Z" || cmd === "z") p.closePath();
      }
      return p;
    };

    // Ensure image element is non-tainted for canvas export
    let el: HTMLImageElement;
    try {
      el = await ensureCleanElement(targetImg);
    } catch {
      console.warn("showSelectionPopup: could not get clean image element");
      return;
    }

    // Create mask from path
    const mc = document.createElement("canvas"); mc.width = w; mc.height = h;
    const mx = mc.getContext("2d")!;
    mx.fillStyle = "white";
    mx.fill(buildPath2D());

    // Modified image (selected area removed)
    const oc = document.createElement("canvas"); oc.width = w; oc.height = h;
    const ox = oc.getContext("2d")!;
    ox.drawImage(el, 0, 0, w, h);
    ox.globalCompositeOperation = "destination-out";
    ox.drawImage(mc, 0, 0);
    const modifiedDataUrl = oc.toDataURL("image/png");

    // Extracted image (only selected area)
    const ec = document.createElement("canvas"); ec.width = w; ec.height = h;
    const ex = ec.getContext("2d")!;
    ex.drawImage(el, 0, 0, w, h);
    ex.globalCompositeOperation = "destination-in";
    ex.drawImage(mc, 0, 0);
    const extractedDataUrl = ec.toDataURL("image/png");

    // Highlight preview: pink overlay on selected area + dotted border
    const hlc = document.createElement("canvas"); hlc.width = w; hlc.height = h;
    const hlx = hlc.getContext("2d")!;
    hlx.drawImage(el, 0, 0, w, h);
    // Pink overlay inside the selection
    hlx.save();
    hlx.clip(buildPath2D());
    hlx.fillStyle = "rgba(254,1,84,0.2)";
    hlx.fillRect(0, 0, w, h);
    hlx.restore();
    // Dotted border around selection (white bg + black dashes)
    const p2d = buildPath2D();
    hlx.strokeStyle = "#ffffff"; hlx.lineWidth = 3; hlx.stroke(p2d);
    hlx.setLineDash([8, 6]);
    hlx.strokeStyle = "#000000"; hlx.lineWidth = 2; hlx.stroke(p2d);
    const highlightDataUrl = hlc.toDataURL("image/png");

    // Memory leak fix: release temp canvases used for selection compositing
    mc.width = 0; mc.height = 0;
    oc.width = 0; oc.height = 0;
    ec.width = 0; ec.height = 0;
    hlc.width = 0; hlc.height = 0;

    // Snapshot savedProps BEFORE awaiting setSrc. setSrc can reset some
    // Fabric image props (notably scaleX/scaleY get recomputed when the
    // new element has different natural dimensions), so capturing after
    // the await would save the post-swap values and the popup's "cancel"
    // would then restore them incorrectly.
    const savedProps = {
      left: targetImg.left, top: targetImg.top,
      scaleX: targetImg.scaleX, scaleY: targetImg.scaleY,
      originX: targetImg.originX, originY: targetImg.originY,
      angle: targetImg.angle, flipX: targetImg.flipX, flipY: targetImg.flipY,
      opacity: targetImg.opacity,
    };

    // Show highlight on image
    const origSrc = targetImg.getSrc();
    await targetImg.setSrc(highlightDataUrl);
    targetImg.dirty = true;
    canvas.requestRenderAll();

    // Use click position or center of wrapper
    const cx = clickX ?? (window.innerWidth / 2);
    const cy = clickY ?? (window.innerHeight / 2);

    setWandPopup({ targetImg, savedProps, modifiedDataUrl, extractedDataUrl, origSrc, clickX: cx, clickY: cy });
  }, []);


  return { startSelectArea, showSelectionPopup };
}
