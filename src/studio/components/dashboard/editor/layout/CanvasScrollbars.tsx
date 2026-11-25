"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { RULER_SIZE } from "../types";
import { getPanExtent, PAN_EVENT, requestPan } from "../canvas/panLimits";

/**
 * Barres de défilement de la zone de travail.
 *
 * Le conteneur du canvas ne défile pas nativement (le visuel est déplacé par
 * translation CSS) : sans ces barres, un visuel zoomé au-delà de la fenêtre
 * n'était atteignable qu'avec Espace + glisser. Chaque barre n'apparaît que
 * sur l'axe où le visuel dépasse.
 *
 * Les poignées sont positionnées directement dans le DOM (pas de rendu React
 * par frame pendant un défilement).
 */

const THICKNESS = 10;
const MIN_THUMB = 36;

type Axis = "x" | "y";

interface Geometry {
  ext: number;       // amplitude du pan sur l'axe (0 = barre masquée)
  track: number;     // longueur de la piste (px)
  thumb: number;     // longueur de la poignée (px)
  view: number;      // taille visible du conteneur sur l'axe
}

function CanvasScrollbarsComponent() {
  const containerRef = useEditorStore(s => s.containerRef);
  const displayScaleRef = useEditorStore(s => s.displayScaleRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const zoomPercent = useEditorStore(s => s.zoomPercent);
  const containerSize = useEditorStore(s => s.containerSize);
  const showRulers = useEditorStore(s => s.showRulers);
  const ready = useEditorStore(s => s.ready);

  const trackRefs = { x: useRef<HTMLDivElement>(null), y: useRef<HTMLDivElement>(null) };
  const thumbRefs = { x: useRef<HTMLDivElement>(null), y: useRef<HTMLDivElement>(null) };
  const panRef = useRef({ x: 0, y: 0 });
  const geoRef = useRef<Record<Axis, Geometry>>({
    x: { ext: 0, track: 0, thumb: 0, view: 0 },
    y: { ext: 0, track: 0, thumb: 0, view: 0 },
  });

  const layout = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const e = getPanExtent(cont, canvasWidth, canvasHeight, displayScaleRef.current || 1);
    (["x", "y"] as Axis[]).forEach(axis => {
      const track = trackRefs[axis].current;
      const thumb = thumbRefs[axis].current;
      if (!track || !thumb) return;
      const ext = axis === "x" ? e.extX : e.extY;
      const view = axis === "x" ? e.viewW : e.viewH;
      track.style.display = ext ? "block" : "none";
      if (!ext) { geoRef.current[axis] = { ext: 0, track: 0, thumb: 0, view }; return; }
      const trackLen = axis === "x" ? track.clientWidth : track.clientHeight;
      // Part visible = fenêtre / étendue totale parcourue (fenêtre + 2 × amplitude)
      const thumbLen = Math.max(MIN_THUMB, Math.min(trackLen, trackLen * view / (view + 2 * ext)));
      geoRef.current[axis] = { ext, track: trackLen, thumb: thumbLen, view };
      // pan = +ext → début du visuel (poignée en haut / à gauche)
      const pan = Math.max(-ext, Math.min(ext, panRef.current[axis]));
      const pos = ((ext - pan) / (2 * ext)) * (trackLen - thumbLen);
      if (axis === "x") { thumb.style.width = `${thumbLen}px`; thumb.style.transform = `translateX(${pos}px)`; }
      else { thumb.style.height = `${thumbLen}px`; thumb.style.transform = `translateY(${pos}px)`; }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, displayScaleRef, canvasWidth, canvasHeight]);

  // Suit le pan (molette, Espace + glisser, zoom à la molette…)
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont || !ready) return;
    const onPan = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) panRef.current = { x: d.x || 0, y: d.y || 0 };
      layout();
    };
    cont.addEventListener(PAN_EVENT, onPan);
    return () => cont.removeEventListener(PAN_EVENT, onPan);
  }, [containerRef, ready, layout]);

  // Zoom, taille de fenêtre, règles affichées ou non → nouvelle géométrie
  useEffect(() => {
    layout();
    // Les tailles CSS du canvas sont posées juste avant ce rendu ; un second
    // passage après mise en page couvre l'ouverture d'un panneau latéral.
    const id = requestAnimationFrame(layout);
    return () => cancelAnimationFrame(id);
  }, [layout, zoomPercent, containerSize.w, containerSize.h, showRulers, ready]);

  const startDrag = (axis: Axis) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const g = geoRef.current[axis];
    const travel = g.track - g.thumb;
    if (!g.ext || travel <= 0) return;
    const el = e.currentTarget;
    const startMouse = axis === "x" ? e.clientX : e.clientY;
    const startPan = Math.max(-g.ext, Math.min(g.ext, panRef.current[axis]));
    try { el.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    el.dataset.dragging = "1";
    const onMove = (ev: PointerEvent) => {
      const d = (axis === "x" ? ev.clientX : ev.clientY) - startMouse;
      const pan = Math.max(-g.ext, Math.min(g.ext, startPan - (d / travel) * 2 * g.ext));
      const other = panRef.current;
      requestPan(containerRef.current, axis === "x" ? pan : other.x, axis === "y" ? pan : other.y);
    };
    const onEnd = (ev: PointerEvent) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onEnd);
      el.removeEventListener("pointercancel", onEnd);
      delete el.dataset.dragging;
      try { el.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onEnd);
    el.addEventListener("pointercancel", onEnd);
  };

  // Clic sur la piste, hors poignée : avance d'une « page » vers le clic
  const pageJump = (axis: Axis) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    const g = geoRef.current[axis];
    const thumb = thumbRefs[axis].current;
    if (!g.ext || !thumb) return;
    const r = thumb.getBoundingClientRect();
    const before = axis === "x" ? e.clientX < r.left : e.clientY < r.top;
    const cur = Math.max(-g.ext, Math.min(g.ext, panRef.current[axis]));
    const pan = Math.max(-g.ext, Math.min(g.ext, cur + (before ? 1 : -1) * g.view * 0.8));
    const other = panRef.current;
    requestPan(containerRef.current, axis === "x" ? pan : other.x, axis === "y" ? pan : other.y);
  };

  // Ne pas laisser le clic remonter au conteneur (il désélectionne l'objet)
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!ready) return null;
  const startInset = (showRulers ? RULER_SIZE : 0) + 4;
  const thumbClass =
    "absolute rounded-full bg-gray-500/45 hover:bg-gray-600/70 data-[dragging]:bg-[#4f46e5]/80 transition-colors touch-none";

  return (
    <>
      <div
        ref={trackRefs.x}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-label="Défilement horizontal du visuel"
        className="absolute z-30 rounded-full bg-gray-300/40 hover:bg-gray-300/70 transition-colors touch-none"
        style={{ display: "none", left: startInset, right: THICKNESS + 8, bottom: 3, height: THICKNESS }}
        onPointerDown={pageJump("x")}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <div
          ref={thumbRefs.x}
          className={`${thumbClass} top-0 left-0 h-full cursor-pointer`}
          title="Glisser pour déplacer le visuel"
          onPointerDown={startDrag("x")}
        />
      </div>
      <div
        ref={trackRefs.y}
        role="scrollbar"
        aria-orientation="vertical"
        aria-label="Défilement vertical du visuel"
        className="absolute z-30 rounded-full bg-gray-300/40 hover:bg-gray-300/70 transition-colors touch-none"
        style={{ display: "none", top: startInset, bottom: THICKNESS + 8, right: 3, width: THICKNESS }}
        onPointerDown={pageJump("y")}
        onMouseDown={swallow}
        onClick={swallow}
      >
        <div
          ref={thumbRefs.y}
          className={`${thumbClass} top-0 left-0 w-full cursor-pointer`}
          title="Glisser pour déplacer le visuel"
          onPointerDown={startDrag("y")}
        />
      </div>
    </>
  );
}

export const CanvasScrollbars = CanvasScrollbarsComponent;
