"use client";

import { useState, useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { observeResize } from "@/studio/lib/observeResize";

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

  // 3. Space + drag = pan canvas (hand tool, like Photoshop/Figma) + momentum inertia
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let spaceHeld = false;
    const getCanvasParent = () => container.querySelector("[data-canvas-pan]") as HTMLElement | null;

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
      panOffsetRef.current = clamped;
      const el = getCanvasParent();
      if (el) el.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
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
            panOffsetRef.current = clamped;
            const el = getCanvasParent();
            if (el) el.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
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
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const currentScale = userZoomRef.current ?? autoScaleRef.current;
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newScale = Math.max(0.1, Math.min(3, currentScale + delta));
      const panEl = container.querySelector("[data-canvas-pan]") as HTMLElement | null;
      if (panEl && currentScale !== newScale) {
        const contRect = container.getBoundingClientRect();
        const mouseContX = e.clientX - contRect.left;
        const mouseContY = e.clientY - contRect.top;
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
        panOffsetRef.current = clampedZoom;
        panEl.style.transform = `translate(${clampedZoom.x}px, ${clampedZoom.y}px)`;
        fabricRef.current?.calcOffset();
        setZoomPercent(Math.round(newScale * 100));
      }
      // Skip setZoomPercent when clamped at min/max — avoids unnecessary
      // React re-renders when the user keeps scrolling at the zoom limits.
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerReady]);

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
