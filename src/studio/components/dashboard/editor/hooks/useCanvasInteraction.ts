"use client";

import { useState, useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { observeResize } from "@/studio/lib/observeResize";
import { getPanExtent, PAN_EVENT, PAN_REQUEST_EVENT } from "../canvas/panLimits";

export function useCanvasInteraction(params: any) {
  const {
    containerRef,
    fabricRef,
    userZoomRef,
    autoScaleRef,
    applyScaleRef,
    setZoomPercent,
    cleanupTools,
    activeTab,
    selectedObj,
    cropping,
    penMode,
    penEditMode,
    editingGroup,
    lassoActive,
    showVersions,
    setShowVersions,
  } = params;

  // ── State moved from FrameEditor ──
  const [isPanning, setIsPanning] = useState(false);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const zoomPercent = useEditorStore(s => s.zoomPercent);
  const containerW = useEditorStore(s => s.containerSize.w);
  const containerH = useEditorStore(s => s.containerSize.h);
  // Bump this ref-version state once containerRef.current becomes
  // available. In React 18 strict mode / suspense the element ref may
  // bind a frame or two after the initial effect runs; without this,
  // all the useEffect hooks below that read `containerRef.current` at
  // mount would see `null` and silently no-op forever. We poll for
  // ~500ms (well within any reasonable mount delay) and flip the
  // counter once the container appears.
  const [containerReady, setContainerReady] = useState(() => !!containerRef.current);
  useEffect(() => {
    if (containerReady) return;
    let tries = 0;
    const check = () => {
      if (containerRef.current) { setContainerReady(true); return; }
      if (++tries < 20) setTimeout(check, 25);
    };
    check();
  }, [containerReady, containerRef]);

  // 1. Auto-cleanup tools when switching sidebar tabs
  useEffect(() => {
    cleanupTools();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 2. Pinch-to-zoom on touch devices
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let lastPinchDist = 0;
    const resetPinch = () => { lastPinchDist = 0; };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) { lastPinchDist = 0; return; }
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist > 0) {
        const delta = (dist - lastPinchDist) * 0.003;
        const currentScale = userZoomRef.current ?? autoScaleRef.current;
        const newScale = Math.max(0.1, Math.min(3, currentScale + delta));
        if (newScale !== currentScale) {
          // If the new scale is essentially auto-fit, clear userZoomRef
          // so future resizes restore the auto-fit behaviour instead of
          // permanently locking to the pinched-and-held value.
          const auto = autoScaleRef.current;
          if (auto && Math.abs(newScale - auto) < 0.01) {
            userZoomRef.current = null;
          } else {
            userZoomRef.current = newScale;
          }
          applyScaleRef.current?.(newScale);
          setZoomPercent(Math.round(newScale * 100));
        }
      }
      lastPinchDist = dist;
    };
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    // touchend AND touchcancel both reset the pinch state — iOS fires
    // touchcancel when the system interrupts (incoming call, control
    // center swipe, etc.); without handling it, the next pinch would
    // jump because lastPinchDist retained the stale value.
    container.addEventListener("touchend", resetPinch);
    container.addEventListener("touchcancel", resetPinch);
    return () => {
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", resetPinch);
      container.removeEventListener("touchcancel", resetPinch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerReady]);

  /**
   * Clamp pan offset so at least a reasonable portion of the canvas stays
   * on screen at any zoom level. Previously this used fixed container-based
   * bounds (cw*0.8) which let the canvas be panned completely off-screen
   * at low zoom and prevented reaching far corners at high zoom.
   */
  function clampPan(x: number, y: number): { x: number; y: number } {
    const cont = containerRef.current;
    if (!cont) return { x, y };
    const cw = cont.clientWidth;
    const ch = cont.clientHeight;
    const { bufferWidth, bufferHeight } = useEditorStore.getState();
    const scale = userZoomRef.current ?? autoScaleRef.current ?? 1;
    const contentW = bufferWidth * scale;
    const contentH = bufferHeight * scale;
    // Keep at least ~15% of the content visible on each axis so the user
    // can never fully lose the canvas off-screen. Allow enough travel so
    // the opposite edge can always be reached regardless of zoom.
    const visibleMin = 0.15;
    const maxX = Math.max(cw / 2, contentW / 2 + cw / 2 - contentW * visibleMin);
    const maxY = Math.max(ch / 2, contentH / 2 + ch / 2 - contentH * visibleMin);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }

  /** Amplitude de défilement (barres, molette) au zoom courant. */
  function panExtent() {
    const { canvasWidth, canvasHeight } = useEditorStore.getState();
    const scale = userZoomRef.current ?? autoScaleRef.current ?? 1;
    return getPanExtent(containerRef.current, canvasWidth, canvasHeight, scale);
  }

  /**
   * Seul point d'écriture du pan : applique la translation, prévient les
   * barres de défilement, puis recale (une fois par frame) ce qui dépend de
   * la position du visuel à l'écran — repère souris de Fabric, règles,
   * barre flottante de la sélection.
   */
  const panSyncRafRef = useRef(0);
  const panSettleTimerRef = useRef(0);
  function applyPan(x: number, y: number) {
    const cont = containerRef.current;
    panOffsetRef.current = { x, y };
    if (!cont) return;
    const el = cont.querySelector("[data-canvas-pan]") as HTMLElement | null;
    if (el) el.style.transform = x || y ? `translate(${x}px, ${y}px)` : "";
    cont.dispatchEvent(new CustomEvent(PAN_EVENT, { detail: { x, y } }));
    if (panSyncRafRef.current) return;
    panSyncRafRef.current = requestAnimationFrame(() => {
      panSyncRafRef.current = 0;
      const canvas = fabricRef.current as any;
      if (!canvas?.lowerCanvasEl) return;
      try {
        canvas.calcOffset();
        if (useEditorStore.getState().showRulers) canvas._updateRulerOffset?.();
        canvas._updateFloatingPos?.(true);
      } catch { /* canvas disposed */ }
      // Pendant le déplacement la barre flottante est déplacée dans le DOM ;
      // une fois le pan stabilisé, l'état React est remis d'accord (sinon le
      // prochain rendu la replacerait à son ancienne position).
      window.clearTimeout(panSettleTimerRef.current);
      panSettleTimerRef.current = window.setTimeout(() => {
        try { (fabricRef.current as any)?._updateFloatingPos?.(); } catch { /* canvas disposed */ }
      }, 120);
    });
  }
  useEffect(() => () => {
    if (panSyncRafRef.current) cancelAnimationFrame(panSyncRafRef.current);
    window.clearTimeout(panSettleTimerRef.current);
  }, []);

  // 3. Space + drag = pan canvas (hand tool, like Photoshop/Figma) + momentum inertia
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let spaceHeld = false;
    // Velocity tracking for momentum
    let velX = 0, velY = 0;
    let lastMoveTime = 0;
    let lastMoveX = 0, lastMoveY = 0;
    let momentumRafId: number | null = null;

    function cancelMomentum() {
      if (momentumRafId !== null) { cancelAnimationFrame(momentumRafId); momentumRafId = null; }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spaceHeld && !(e.target as HTMLElement)?.closest("input,textarea,[contenteditable]")) {
        const active = fabricRef.current?.getActiveObject();
        if (active?.isEditing) return;
        spaceHeld = true;
        setIsPanning(true);
        container.style.cursor = "grab";
        const canvas = fabricRef.current;
        if (canvas) {
          canvas.defaultCursor = "grab";
          canvas.hoverCursor = "grab";
          canvas.skipTargetFind = true;
          canvas.selection = false;
          canvas.upperCanvasEl.style.cursor = "grab";
        }
        e.preventDefault();
      }
    };
    // Shared reset helper: exit pan mode and stop any in-flight momentum.
    // Called from keyup and from window.blur (see below) so the user can't
    // get stuck in pan mode after Alt+Tab or switching windows.
    const exitPanMode = () => {
      spaceHeld = false;
      setIsPanning(false);
      panDragRef.current = null;
      cancelMomentum();
      container.style.cursor = "";
      const canvas = fabricRef.current;
      if (canvas) {
        canvas.defaultCursor = "default";
        canvas.hoverCursor = "move";
        canvas.skipTargetFind = false;
        canvas.selection = true;
        canvas.upperCanvasEl.style.cursor = "";
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") exitPanMode();
    };
    const onWindowBlur = () => exitPanMode();
    const onMouseDown = (e: MouseEvent) => {
      if (!spaceHeld) return;
      // Les barres de défilement gèrent leur propre glisser
      if ((e.target as HTMLElement | null)?.closest?.("[data-canvas-scrollbar]")) return;
      cancelMomentum(); // stop any ongoing inertia on new drag
      velX = 0; velY = 0;
      lastMoveTime = performance.now();
      lastMoveX = panOffsetRef.current.x;
      lastMoveY = panOffsetRef.current.y;
      panDragRef.current = { startX: e.clientX, startY: e.clientY, origX: panOffsetRef.current.x, origY: panOffsetRef.current.y };
      container.style.cursor = "grabbing";
      const canvas = fabricRef.current;
      if (canvas) canvas.upperCanvasEl.style.cursor = "grabbing";
      e.preventDefault();
      e.stopPropagation();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!panDragRef.current) return;
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      const newX = panDragRef.current.origX + dx;
      const newY = panDragRef.current.origY + dy;
      // Track velocity (px/ms → px/frame at 60Hz)
      const now = performance.now();
      const dt = now - lastMoveTime;
      if (dt > 0 && dt < 80) {
        velX = ((newX - lastMoveX) / dt) * 16;
        velY = ((newY - lastMoveY) / dt) * 16;
      }
      lastMoveX = newX; lastMoveY = newY; lastMoveTime = now;
      const clamped = clampPan(newX, newY);
      applyPan(clamped.x, clamped.y);
    };
    const onMouseUp = () => {
      if (panDragRef.current) {
        panDragRef.current = null;
        container.style.cursor = spaceHeld ? "grab" : "";
        const canvas = fabricRef.current;
        if (canvas) {
          canvas.upperCanvasEl.style.cursor = spaceHeld ? "grab" : "";
          canvas.calcOffset();
        }
        // Launch momentum if we have meaningful velocity
        if (Math.abs(velX) > 0.8 || Math.abs(velY) > 0.8) {
          let vx = velX, vy = velY;
          const DECAY = 0.88;
          const tick = () => {
            vx *= DECAY; vy *= DECAY;
            const rawX = panOffsetRef.current.x + vx;
            const rawY = panOffsetRef.current.y + vy;
            const clamped = clampPan(rawX, rawY);
            applyPan(clamped.x, clamped.y);
            // Stop if velocity is low OR we hit the bounds
            const hitBounds = (Math.abs(clamped.x - rawX) > 0.5) || (Math.abs(clamped.y - rawY) > 0.5);
            if ((Math.abs(vx) > 0.2 || Math.abs(vy) > 0.2) && !hitBounds) {
              momentumRafId = requestAnimationFrame(tick);
            } else {
              momentumRafId = null;
              fabricRef.current?.calcOffset();
            }
          };
          momentumRafId = requestAnimationFrame(tick);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    container.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      cancelMomentum();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      container.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerReady]);

  // 4. Scroll wheel zoom on canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Molette seule = défilement vertical, Maj + molette (ou geste
    // horizontal du pavé tactile) = horizontal — uniquement sur les axes où
    // le visuel zoomé dépasse la fenêtre.
    const onWheelScroll = (e: WheelEvent) => {
      // Laisse défiler une liste / un panneau ouvert par-dessus le canvas
      for (let n = e.target as HTMLElement | null; n && n !== container; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return;
      }
      const { extX, extY, viewH } = panExtent();
      if (!extX && !extY) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewH : 1;
      let dx = e.deltaX * unit;
      let dy = e.deltaY * unit;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      const cur = panOffsetRef.current;
      // Un axe sans défilement ne bouge pas ; un pan déjà hors course
      // (Espace + glisser) n'est pas ramené de force, il peut juste revenir.
      const step = (v: number, d: number, ext: number) => {
        if (!ext || !d) return v;
        const lim = Math.max(ext, Math.abs(v));
        return Math.max(-lim, Math.min(lim, v - d));
      };
      const nx = step(cur.x, dx, extX);
      const ny = step(cur.y, dy, extY);
      // Toujours consommé quand la zone défile : sinon la page derrière
      // l'éditeur partirait en bout de course.
      e.preventDefault();
      if (nx !== cur.x || ny !== cur.y) applyPan(nx, ny);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) { onWheelScroll(e); return; }
      e.preventDefault();
      const currentScale = userZoomRef.current ?? autoScaleRef.current;
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newScale = Math.max(0.1, Math.min(3, currentScale + delta));
      const panEl = container.querySelector("[data-canvas-pan]") as HTMLElement | null;
      if (panEl && currentScale !== newScale) {
        const contRect = container.getBoundingClientRect();
        // Le pan est mesuré depuis le centre du conteneur (visuel centré à
        // pan = 0) : la souris doit l'être aussi, sinon le point sous le
        // curseur dérive à chaque cran de zoom.
        const mouseContX = e.clientX - contRect.left - contRect.width / 2;
        const mouseContY = e.clientY - contRect.top - contRect.height / 2;
        const px = panOffsetRef.current.x;
        const py = panOffsetRef.current.y;
        const ratio = newScale / currentScale;
        const newPx = mouseContX - (mouseContX - px) * ratio;
        const newPy = mouseContY - (mouseContY - py) * ratio;
        // If the user zoomed back to auto-fit, release the lock so
        // future resize events restore fit-scale behaviour.
        const auto = autoScaleRef.current;
        if (auto && Math.abs(newScale - auto) < 0.01) {
          userZoomRef.current = null;
        } else {
          userZoomRef.current = newScale;
        }
        applyScaleRef.current?.(newScale);
        const clampedZoom = clampPan(newPx, newPy);
        applyPan(clampedZoom.x, clampedZoom.y);
        setZoomPercent(Math.round(newScale * 100));
      }
      // Skip setZoomPercent when clamped at min/max — avoids unnecessary
      // React re-renders when the user keeps scrolling at the zoom limits.
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerReady]);

  // 4b. Demandes de pan venues d'ailleurs (barres de défilement, « recentrer »)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onRequest = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
      const c = clampPan(d.x, d.y);
      applyPan(c.x, c.y);
    };
    container.addEventListener(PAN_REQUEST_EVENT, onRequest);
    return () => container.removeEventListener(PAN_REQUEST_EVENT, onRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerReady]);

  // 4c. Après un changement de zoom ou de taille de fenêtre, garder le
  // visuel atteignable :
  //  - axe qui défile, zoom modifié (boutons, curseur, pincement — ils ne
  //    touchent pas au pan) → pan ramené dans la course des barres, sinon
  //    un dézoom laisserait le visuel hors de la fenêtre ;
  //  - axe qui cesse de défiler → recentré (plus de barre pour le ramener) ;
  //  - axe où tout est visible, zoom modifié → le visuel reste dans la fenêtre.
  // Un pan fait à la main (Espace + glisser vers la marge de travail) n'est
  // pas touché tant que le zoom ne change pas.
  const prevPanStateRef = useRef({ zoom: zoomPercent, extX: 0, extY: 0 });
  useEffect(() => {
    if (!containerRef.current || panDragRef.current) return;
    const { extX, extY, viewW, viewH, contentW, contentH } = panExtent();
    const prev = prevPanStateRef.current;
    const zoomChanged = prev.zoom !== zoomPercent;
    prevPanStateRef.current = { zoom: zoomPercent, extX, extY };
    const cur = panOffsetRef.current;
    const settle = (v: number, ext: number, prevExt: number, view: number, content: number) => {
      if (ext) return zoomChanged ? Math.max(-ext, Math.min(ext, v)) : v;
      if (prevExt) return 0;
      if (!zoomChanged) return v;
      // Visuel entièrement visible : un zoom ne doit pas le sortir de la fenêtre
      const room = Math.max(0, (view - content) / 2);
      return Math.max(-room, Math.min(room, v));
    };
    const c = clampPan(
      settle(cur.x, extX, prev.extX, viewW, contentW),
      settle(cur.y, extY, prev.extY, viewH, contentH),
    );
    if (c.x !== cur.x || c.y !== cur.y) applyPan(c.x, c.y);
    else containerRef.current.dispatchEvent(new CustomEvent(PAN_EVENT, { detail: cur }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomPercent, containerW, containerH, containerReady]);

  // 5. Canvas position recalculation when toolbars/panels change layout.
  // Previously three setTimeout(30/150/300) calls were chained, which is
  // unreliable on slow devices and wasteful on fast ones. We now observe
  // the container for layout changes and recompute once each time the
  // container actually moves (via ResizeObserver on the container).
  useEffect(() => {
    const canvas = fabricRef.current;
    const cont = containerRef.current;
    if (!canvas || !cont) return;

    // Immediate recalculation after the dep change is flushed.
    let rafId1 = requestAnimationFrame(() => {
      rafId1 = requestAnimationFrame(() => {
        canvas.calcOffset();
        (canvas as any)._updateCanvasSize?.();
      });
    });

    // Observe the container for any subsequent layout movement (e.g. a
    // panel CSS transition finishes a few frames later). Falls back to
    // window resize on browsers without ResizeObserver (Safari iOS < 13.1).
    let pendingRaf = 0;
    const unobserveResize = observeResize(cont, () => {
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = 0;
        canvas.calcOffset();
      });
    });

    return () => {
      if (rafId1) cancelAnimationFrame(rafId1);
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      unobserveResize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObj, cropping, penMode, penEditMode, editingGroup, activeTab, lassoActive]);

  // 6. Close version history dropdown on click outside
  useEffect(() => {
    if (!showVersions) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-version-history]")) {
        setShowVersions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showVersions]);

  return { isPanning, panOffsetRef, panDragRef };
}
