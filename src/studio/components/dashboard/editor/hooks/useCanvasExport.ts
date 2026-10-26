import { useState, useCallback, useRef } from "react";
import { CUSTOM_PROPS, EXPORT_MULTIPLIER } from "../types";
import { buildBlobMap, fixBlobUrls, fetchWithTimeout } from "../canvas/canvasUtils";
import { toast } from "../../Toast";
import { apiUrl } from "@/studio/lib/api";

const PRINT_MARGIN = 20;

/** Corps envoyé à l'API lors d'un « Enregistrer » (routes bibliothèques /
 *  événements), et passé tel quel à un [UseCanvasExportParams.saveHandler]. */
export interface FrameSavePayload {
  name: string;
  formatId: string;
  gabaritId: string;
  shootCount: number;
  imageDataUrl: string;
  thumbnailDataUrl: string;
  canvasState: string;
}

export interface UseCanvasExportParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  eventId?: string;
  catalogMode?: boolean;
  frameId?: string;
  format: { id: string; name: string; widthPx: number; heightPx: number };
  gabarit: { id: string; name: string };
  shareToken?: string;
  frameName: string;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (createdId?: string) => void;
  typeSlug?: string;
  /**
   * Remplace l'appel POST/PUT intégré. Utilisé par l'éditeur public (lien
   * obfusqué, sans compte) dont l'API cible n'est pas celle des bibliothèques.
   * Rejeter = échec de la sauvegarde.
   */
  saveHandler?: (payload: FrameSavePayload) => Promise<{ id?: string } | void>;
}

export function useCanvasExport({
  fabricRef,
  canvasWidth,
  canvasHeight,
  BLEED_PX,
  eventId,
  catalogMode,
  frameId,
  format,
  gabarit,
  shareToken,
  frameName,
  saving,
  setSaving,
  onSaved,
  typeSlug,
  saveHandler,
}: UseCanvasExportParams) {
  const effectiveTypeSlug = typeSlug || "cadres";
  const isCadres = effectiveTypeSlug === "cadres";
  // Both cadres and non-cadres now store widthPx/heightPx in actual pixels.
  // Cadres export as PNG (alpha needed for shoot zone holes), non-cadres
  // as JPEG (lighter for screens/coupons, no alpha required since they
  // have a solid background). Output dimensions = the format's exact
  // pixel dims so frames round-trip pixel-perfect with the booth.
  const exportMime = isCadres ? "image/png" : "image/jpeg";
  const exportExt = isCadres ? "png" : "jpg";
  const exportQuality = isCadres ? 1 : 0.92;
  const computeOutDims = () => ({
    outW: Math.round(format.widthPx),
    outH: Math.round(format.heightPx),
  });
  // ── Share state ──
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareAccess, setShareAccess] = useState<"edit" | "view">("edit");
  const [shareCopied, setShareCopied] = useState(false);
  const [shareEmailTo, setShareEmailTo] = useState("");
  const [shareEmailMsg, setShareEmailMsg] = useState("");
  const [shareEmailSending, setShareEmailSending] = useState(false);
  const [shareEmailSent, setShareEmailSent] = useState(false);

  // ── Margin check state ──
  const [marginWarnings, setMarginWarningsLocal] = useState<{ name: string; type: string; side: string; overflow: number }[]>([]);
  const [marginCheckPreview, setMarginCheckPreviewLocal] = useState<string>("");
  const [pendingSaveAfterCheck, setPendingSaveAfterCheckLocal] = useState(false);
  const [showMarginCheck, setShowMarginCheckLocal] = useState(false);

  // ── Save / version state ──
  const [lastSavedAt, setLastSavedAt] = useState<number>(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showVersions, setShowVersions] = useState(false);
  const [versionHistory, setVersionHistory] = useState<{ timestamp: number; label: string }[]>([]);

  // ── renderDesignArea ──
  // Two-step pixel-perfect export:
  //  1. Fabric renders the FULL buffer at an integer multiplier (3) — clean
  //     pixel grid, no subpixel artefacts.
  //  2. We crop the design area with drawImage using strictly integer source
  //     coordinates (BLEED_PX × 3, canvasWidth × 3, …) and downscale once
  //     to the final target resolution (EXPORT_TARGET_LONG_EDGE on long edge).
  // This was the most reliable approach in our testing — no left-edge offset.
  const renderDesignArea = useCallback(async (): Promise<string> => {
    const canvas = fabricRef.current;
    if (!canvas) return "";
    const M = EXPORT_MULTIPLIER; // integer (3)

    // Reset viewportTransform so pan/zoom applied for on-screen display
    // doesn't offset the export. Restore after rendering.
    const origVpt = canvas.viewportTransform ? (canvas.viewportTransform as number[]).slice() : [1, 0, 0, 1, 0, 0];
    const origZoom = typeof canvas.getZoom === "function" ? canvas.getZoom() : 1;
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    if (typeof canvas.setZoom === "function") canvas.setZoom(1);

    // The canvas clipPath is rendered with anti-aliasing, leaving a 1-2px
    // semi-transparent band at the design-area edges. Once we flatten onto
    // the export background colour that band shows up as a lighter stripe
    // along the border. Enlarge the clipPath by a safety margin so the AA
    // falls OUTSIDE the cropped region, then restore it afterwards.
    const origClipPath = canvas.clipPath;
    const AA_SAFETY = 2;
    if (origClipPath && typeof origClipPath.set === "function") {
      canvas.clipPath = new (origClipPath.constructor as any)({
        ...origClipPath.toObject?.(),
        left: (origClipPath.left ?? 0) - AA_SAFETY,
        top: (origClipPath.top ?? 0) - AA_SAFETY,
        width: (origClipPath.width ?? 0) + AA_SAFETY * 2,
        height: (origClipPath.height ?? 0) + AA_SAFETY * 2,
        absolutePositioned: true,
      });
    }
    canvas.renderAll();

    let fullDataUrl = "";
    try {
      fullDataUrl = canvas.toDataURL({
        format: "png",
        quality: 1,
        multiplier: M,
        enableRetinaScaling: false,
      });
    } finally {
      // Restore display viewport + clipPath whatever happens.
      canvas.clipPath = origClipPath;
      canvas.viewportTransform = origVpt as any;
      if (typeof canvas.setZoom === "function") canvas.setZoom(origZoom);
      canvas.renderAll();
    }

    // Load source image and crop with strictly integer coords.
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Render image load failed"));
      img.src = fullDataUrl;
    });
    const srcX = BLEED_PX * M;
    const srcY = BLEED_PX * M;
    const srcW = canvasWidth * M;
    const srcH = canvasHeight * M;
    const { outW, outH } = computeOutDims();
    const offscreen = document.createElement("canvas");
    offscreen.width = outW;
    offscreen.height = outH;
    const ctx = offscreen.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // JPEG has no alpha — paint the background white first so any transparent
    // pixels in the source render white instead of black.
    if (exportMime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    const result = offscreen.toDataURL(exportMime, exportQuality);
    offscreen.width = 1; offscreen.height = 1;
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabricRef, canvasWidth, canvasHeight, BLEED_PX, exportMime, exportQuality]);

  // Legacy passthrough — kept for callers that pass a pre-rendered URL.
  const cropToDesignArea = useCallback(
    async (fullDataUrl: string): Promise<string> => fullDataUrl,
    [],
  );

  // In-flight guard against double-click on Share button
  const creatingShareRef = useRef(false);

  // ── handleShare ──
  const handleShare = useCallback(async () => {
    setShowShareModal(true);
    setShareCopied(false);

    // Generate share link if we don't have one yet
    if (!shareUrl) {
      // Prevent double-click from creating two share tokens
      if (creatingShareRef.current) return;
      creatingShareRef.current = true;
      const canvas = fabricRef.current;
      if (!canvas) { creatingShareRef.current = false; return; }
      const csObj = (canvas as any).toObject(CUSTOM_PROPS);
      {
        const bm = buildBlobMap(canvas);
        if (csObj.objects) {
          for (const o of csObj.objects) fixBlobUrls(o, bm);
        }
      }
      const canvasState = JSON.stringify(csObj);
      try {
        if (shareToken) {
          const res = await fetchWithTimeout(apiUrl(`/api/share/${shareToken}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ canvasState, frameName }),
            timeoutMs: 30000,
          });
          if (!res.ok) throw new Error("Erreur");
          setShareUrl(`${window.location.origin}/share/${shareToken}`);
        } else {
          const res = await fetchWithTimeout(apiUrl("/api/share"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              formatId: format.id,
              gabaritId: gabarit.id,
              canvasState,
              frameName,
              editable: shareAccess === "edit",
            }),
            timeoutMs: 30000,
          });
          if (!res.ok) throw new Error("Erreur");
          const data = await res.json();
          setShareUrl(`${window.location.origin}${data.url}`);
        }
      } catch {
        toast("Erreur lors de la création du lien.", "error");
        setShowShareModal(false);
      } finally {
        creatingShareRef.current = false;
      }
    }
  }, [fabricRef, shareUrl, shareToken, frameName, format.id, gabarit.id, shareAccess]);

  // ── copyShareLink ──
  const copyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch {
      toast("Impossible de copier dans le presse-papier.", "error");
    }
  }, [shareUrl]);

  // ── checkPrintMargins ──
  const checkPrintMargins = useCallback((): { name: string; type: string; side: string; overflow: number }[] => {
    const canvas = fabricRef.current;
    if (!canvas) return [];
    const warnings: { name: string; type: string; side: string; overflow: number }[] = [];
    const margin = PRINT_MARGIN;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.getObjects().forEach((obj: any) => {
      // Skip non-content objects
      if (obj._isShootZone || obj._isShootLabel || obj._isTextGuide || obj._isDesignAreaBg || !obj.visible) return;
      // Skip full-canvas background layers (they're expected to bleed edge-to-edge)
      if (obj._isSolidBg || obj._isGradientBg || obj._isBgImage) return;
      // Skip transient tool overlays: magnetic snap guides, pen/feather previews, crop helpers
      if (obj._isGuideline || obj._isPenOverlay || obj._isPenPreview || obj._isFeatherPreview ||
          obj._isCropRect || obj._isCropOverlay || obj._isCropPreview) return;
      // Skip preview-mode layers (person photos + bg fills injected into shoots)
      if (obj._isPreviewLayer) return;
      const isFullBg = obj.type === "image" && obj.width && obj.height &&
        (obj.width * (obj.scaleX || 1)) >= canvasWidth * 0.95 &&
        (obj.height * (obj.scaleY || 1)) >= canvasHeight * 0.95;
      if (isFullBg) return;

      // Use aCoords (4 corner points after transform) for tight overflow detection.
      // We check if any corner lies outside the safe area — avoids false positives
      // that the axis-aligned getBoundingRect causes on rotated objects whose
      // AABB is larger than the visual shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aC: any = obj.aCoords || obj.oCoords || null;
      const corners = aC
        ? [
            { x: aC.tl.x - BLEED_PX, y: aC.tl.y - BLEED_PX },
            { x: aC.tr.x - BLEED_PX, y: aC.tr.y - BLEED_PX },
            { x: aC.br.x - BLEED_PX, y: aC.br.y - BLEED_PX },
            { x: aC.bl.x - BLEED_PX, y: aC.bl.y - BLEED_PX },
          ]
        : (() => {
            const rb = obj.getBoundingRect(true);
            return [
              { x: rb.left - BLEED_PX, y: rb.top - BLEED_PX },
              { x: rb.left + rb.width - BLEED_PX, y: rb.top - BLEED_PX },
              { x: rb.left + rb.width - BLEED_PX, y: rb.top + rb.height - BLEED_PX },
              { x: rb.left - BLEED_PX, y: rb.top + rb.height - BLEED_PX },
            ];
          })();
      // Determine object type label
      let typeName = "Élément";
      let objName = "";
      if (obj.type === "textbox" || obj.type === "i-text" || obj.type === "text") {
        typeName = "Texte";
        objName = (obj.text || "").substring(0, 30);
      } else if (obj.type === "image") {
        typeName = "Image";
        objName = obj._originalName || "Image";
      } else if (obj.type === "group") {
        typeName = "Groupe";
        objName = `${obj._objects?.length || 0} éléments`;
      } else if (obj.type === "path" || obj.type === "polygon" || obj.type === "circle" || obj.type === "rect" || obj.type === "triangle" || obj.type === "ellipse") {
        typeName = "Forme";
      }
      if (!objName) objName = typeName;

      const sides: string[] = [];
      let maxOverflow = 0;

      // Check each corner against each edge; record any overflow per side
      for (const c of corners) {
        if (c.x < margin) {
          if (!sides.includes("gauche")) sides.push("gauche");
          maxOverflow = Math.max(maxOverflow, margin - c.x);
        }
        if (c.y < margin) {
          if (!sides.includes("haut")) sides.push("haut");
          maxOverflow = Math.max(maxOverflow, margin - c.y);
        }
        if (c.x > canvasWidth - margin) {
          if (!sides.includes("droite")) sides.push("droite");
          maxOverflow = Math.max(maxOverflow, c.x - (canvasWidth - margin));
        }
        if (c.y > canvasHeight - margin) {
          if (!sides.includes("bas")) sides.push("bas");
          maxOverflow = Math.max(maxOverflow, c.y - (canvasHeight - margin));
        }
      }

      if (sides.length > 0) {
        warnings.push({
          name: objName,
          type: typeName,
          side: sides.join(", "),
          overflow: Math.round(maxOverflow),
        });
      }
    });

    return warnings;
  }, [fabricRef, canvasWidth, canvasHeight, BLEED_PX]);

  // ── generateMarginPreview ──
  const generateMarginPreview = useCallback(async (): Promise<string> => {
    const canvas = fabricRef.current;
    if (!canvas) return "";
    // Render the design area directly — fabric crops + scales in one pass.
    const croppedDataUrl = await renderDesignArea();
    // renderDesignArea outputs at the format's exact pixel dims.
    const outW = Math.round(format.widthPx);
    const outH = Math.round(format.heightPx);
    const finalScale = outW / canvasWidth;
    const offscreen = document.createElement("canvas");
    offscreen.width = outW;
    offscreen.height = outH;
    const ctx = offscreen.getContext("2d")!;
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
      img.onerror = () => reject(new Error("Margin preview image load failed"));
      img.src = croppedDataUrl;
    });
    // Draw margin overlay — semi-transparent red on edges (all dims at final scale)
    const m = PRINT_MARGIN * finalScale;
    ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
    // Top
    ctx.fillRect(0, 0, outW, m);
    // Bottom
    ctx.fillRect(0, outH - m, outW, m);
    // Left (between top and bottom margins)
    ctx.fillRect(0, m, m, outH - 2 * m);
    // Right
    ctx.fillRect(outW - m, m, m, outH - 2 * m);
    // Dashed inner border
    ctx.setLineDash([6 * finalScale, 4 * finalScale]);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
    ctx.lineWidth = 1.5 * finalScale;
    ctx.strokeRect(m, m, outW - 2 * m, outH - 2 * m);
    const previewResult = offscreen.toDataURL("image/png");
    // Memory leak fix: release offscreen canvas memory
    offscreen.width = 0; offscreen.height = 0;
    return previewResult;
  }, [fabricRef, canvasWidth, canvasHeight, cropToDesignArea]);

  // ── handleDownloadPNG ──
  const handleDownloadPNG = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.discardActiveObject();

    // renderDesignArea outputs at the format's exact pixel dims (widthPx ×
    // heightPx) — shoot-zone coords must match that scale.
    const targetW = Math.round(format.widthPx);
    const targetH = Math.round(format.heightPx);
    const finalScale = targetW / canvasWidth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shootZones: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.getObjects().forEach((o: any) => {
      if (o._isShootZone) {
        shootZones.push({
          left: (o.left - BLEED_PX) * finalScale,
          top: (o.top - BLEED_PX) * finalScale,
          width: o.width * (o.scaleX || 1) * finalScale,
          height: o.height * (o.scaleY || 1) * finalScale,
          angle: o.angle || 0,
          rx: (o.rx || 0) * finalScale,
          ry: (o.ry || 0) * finalScale,
          stroke: o.stroke,
          strokeWidth: (o.strokeWidth || 0) * finalScale,
          strokeDashArray: (o.strokeDashArray || []).map((v: number) => v * finalScale),
        });
        o.set("visible", false);
      }
      if (o._isTextGuide || o._isShootLabel || o._isPenOverlay || o._isPenPreview || o._isFeatherPreview || o._isGuideline || o._isDesignAreaBg) o.set("visible", false);
      // Preview fills/persons must not appear in the bare-cadre PNG export.
      // excludeFromExport only affects toObject/JSON, so toggle visibility.
      if (o._isPreviewLayer) o.set("visible", false);
    });

    // Temporarily set canvas bg to user's design color for export (bleed gray bg would bleed into crop edges)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const designBgObj = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
    const userBgFill = designBgObj ? (typeof designBgObj.fill === "string" ? designBgObj.fill : "#ffffff") : "#ffffff";
    const savedBgColor = canvas.backgroundColor;
    canvas.backgroundColor = userBgFill;
    // Temporarily make design area bg exportable
    if (designBgObj) { designBgObj.excludeFromExport = false; designBgObj.set("visible", true); }

    // Wrap the entire export in try/finally so visibility/bg always get restored
    // even if toDataURL/cropToDesignArea/image load throws (e.g. CORS taint).
    let finalDataUrl = "";
    try {
      canvas.renderAll(); // MUST be sync before toDataURL
      // Render A: bg + user elements (shoot zones already hidden).
      const dataUrl = await renderDesignArea();
      finalDataUrl = dataUrl;
    if (shootZones.length > 0) {
      // Render B: user elements ONLY (hide bg too). Used to re-composite
      // user elements back on top of the punched shoot-zone holes so
      // elements drawn over a shoot zone stay visible in the export.
      //
      // For catalogue (booth Selfizee) loads, the booth uses
      // globalCompositeOperation:"destination-out" on creu_<n> rects to
      // punch holes through everything BELOW them in z-order — including
      // the booth's "background image" layer (watercolor / pattern) that
      // is a regular fabric Image, not flagged as _isBgImage. Our default
      // re-composite re-adds that image, filling back the holes. Hide
      // every catalogue object whose z-index sits BEFORE the LAST shoot
      // (= "below the shoots") so they don't leak back into the holes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allObjsForB: any[] = canvas.getObjects();
      let lastCatalogueShootIndex = -1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allObjsForB.forEach((o: any, i: number) => {
        if (o._isShootZone && o._fromCatalogue && i > lastCatalogueShootIndex) lastCatalogueShootIndex = i;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // Hide ALL background layers so Render B captures only user-drawn elements.
      const bgObjectsForBpng: { obj: any; wasVisible: boolean }[] = [];
      canvas.getObjects().forEach((o: any, i: number) => {
        const isStudioBg = o._isSolidBg || o._isDesignAreaBg || o._isBgImage || o._isGradientBg;
        const isCatalogueBelowShoots = lastCatalogueShootIndex >= 0 &&
          i < lastCatalogueShootIndex && o._fromCatalogue && !o._isShootZone && !o._isShootLabel;
        if (isStudioBg || isCatalogueBelowShoots) {
          bgObjectsForBpng.push({ obj: o, wasVisible: o.visible !== false });
          o.set("visible", false);
        }
      });
      const savedCanvasBgForB = canvas.backgroundColor;
      canvas.backgroundColor = "transparent";
      canvas.renderAll();
      const elementsOnlyUrl = await renderDesignArea();
      bgObjectsForBpng.forEach(({ obj, wasVisible }) => obj.set("visible", wasVisible));
      canvas.backgroundColor = savedCanvasBgForB;
      canvas.renderAll();

      const offscreen = document.createElement("canvas");
      offscreen.width = targetW;
      offscreen.height = targetH;
      const ctx = offscreen.getContext("2d")!;
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
        img.onerror = () => reject(new Error("Export image load failed"));
        img.src = dataUrl;
      });
      ctx.globalCompositeOperation = "destination-out";
      for (const zone of shootZones) {
        ctx.save();
        if (zone.angle) {
          // Shoot zones use originX:"left", originY:"top" — Fabric rotates
          // around the top-left corner (the origin), NOT the geometric center.
          ctx.translate(zone.left, zone.top);
          ctx.rotate((zone.angle * Math.PI) / 180);
          ctx.translate(-zone.left, -zone.top);
        }
        const r = zone.rx || 0;
        if (r > 0) {
          const x = zone.left, y = zone.top, w = zone.width, h = zone.height;
          ctx.beginPath();
          ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + r);
          ctx.lineTo(x + w, y + h - r);
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillRect(zone.left, zone.top, zone.width, zone.height);
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";

      // Re-composite user elements on top of the punched holes so anything
      // drawn OVER a shoot zone stays visible in the export (it would
      // otherwise be erased by the destination-out punch above).
      const elementsImg = new window.Image();
      await new Promise<void>((resolve, reject) => {
        elementsImg.onload = () => { ctx.drawImage(elementsImg, 0, 0); resolve(); };
        elementsImg.onerror = () => reject(new Error("Elements-only image load failed"));
        elementsImg.src = elementsOnlyUrl;
      });

      // Draw stroke borders outside the holes
      for (const zone of shootZones) {
        if (!zone.strokeWidth || zone.strokeWidth <= 0) continue;
        ctx.save();
        const sw = zone.strokeWidth;
        const half = sw / 2;
        // Offset outward: expand rect by half strokeWidth on each side
        const ox = zone.left - half;
        const oy = zone.top - half;
        const ow = zone.width + sw;
        const oh = zone.height + sw;
        if (zone.angle) {
          // Rotate around the shoot zone's origin (top-left), not its center.
          ctx.translate(zone.left, zone.top);
          ctx.rotate((zone.angle * Math.PI) / 180);
          ctx.translate(-zone.left, -zone.top);
        }
        ctx.lineWidth = sw;
        ctx.setLineDash(zone.strokeDashArray || []);
        // Handle gradient or solid stroke
        if (zone.stroke && typeof zone.stroke === "object" && zone.stroke.colorStops) {
          const stops = zone.stroke.colorStops;
          const grad = zone.stroke.type === "radial"
            ? ctx.createRadialGradient(zone.left + zone.width / 2, zone.top + zone.height / 2, 0, zone.left + zone.width / 2, zone.top + zone.height / 2, Math.max(ow, oh) / 2)
            : ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
          for (const s of stops) grad.addColorStop(s.offset, s.color);
          ctx.strokeStyle = grad;
        } else if (typeof zone.stroke === "string") {
          ctx.strokeStyle = zone.stroke;
        } else {
          ctx.restore();
          continue;
        }
        const r = (zone.rx || 0) + half;
        if (r > 0) {
          ctx.beginPath();
          ctx.moveTo(ox + r, oy); ctx.lineTo(ox + ow - r, oy);
          ctx.quadraticCurveTo(ox + ow, oy, ox + ow, oy + r);
          ctx.lineTo(ox + ow, oy + oh - r);
          ctx.quadraticCurveTo(ox + ow, oy + oh, ox + ow - r, oy + oh);
          ctx.lineTo(ox + r, oy + oh);
          ctx.quadraticCurveTo(ox, oy + oh, ox, oy + oh - r);
          ctx.lineTo(ox, oy + r);
          ctx.quadraticCurveTo(ox, oy, ox + r, oy);
          ctx.closePath(); ctx.stroke();
        } else {
          ctx.strokeRect(ox, oy, ow, oh);
        }
        ctx.restore();
      }

      finalDataUrl = offscreen.toDataURL("image/png");
      // Memory leak fix: release offscreen canvas memory after PNG export
      offscreen.width = 0; offscreen.height = 0;
    }
    } catch (err) {
      console.error("PNG export failed:", err);
      toast("Erreur lors de l'export PNG.", "error");
    } finally {
      // Always restore canvas state regardless of success or failure
      canvas.backgroundColor = savedBgColor;
      if (designBgObj) designBgObj.excludeFromExport = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._isShootZone || o._isTextGuide || o._isShootLabel || o._isPenOverlay || o._isPenPreview || o._isFeatherPreview || o._isGuideline || o._isDesignAreaBg) o.set("visible", true);
        if (o._isPreviewLayer) o.set("visible", true);
      });
      canvas.requestRenderAll();
    }

    if (!finalDataUrl) return;

    // Trigger download (outside try/finally so restore happens first)
    const link = document.createElement("a");
    link.download = `${(frameName.trim() || "cadre").replace(/[\\/:*?"<>|]/g, "_")}.${exportExt}`;
    link.href = finalDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [fabricRef, canvasWidth, canvasHeight, frameName, cropToDesignArea]);

  // ── handleSave ──
  const handleSave = useCallback(async (skipMarginCheck = false) => {
    const canvas = fabricRef.current;
    if (!canvas || saving) return; // Prevent duplicate saves

    // Smart margin verification before saving
    if (!skipMarginCheck) {
      const warnings = checkPrintMargins();
      if (warnings.length > 0) {
        const preview = await generateMarginPreview();
        setMarginWarningsLocal(warnings);
        setMarginCheckPreviewLocal(preview);
        setPendingSaveAfterCheckLocal(true);
        setShowMarginCheckLocal(true);
        return;
      }
    }

    setSaving(true);
    // Track canvas mutations for restore in finally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let designBgObj2: any = null;
    let savedBgColor2: any = null;
    let bgMutated = false;

    // renderDesignArea outputs at the format's exact pixel dims — shoot
    // zones and offscreen canvas must match that same scale.
    const targetW2 = Math.round(format.widthPx);
    const targetH2 = Math.round(format.heightPx);
    const finalScale2 = targetW2 / canvasWidth;
    try {
      canvas.discardActiveObject();

      // Capture canvas JSON BEFORE any visibility mutation so reload matches
      // the design state exactly. Strip BLEED_PX from positions so the saved
      // JSON lives in design-area coordinates (restoreCanvasState re-adds BLEED_PX).
      const saveJsonObj = (canvas as any).toObject(CUSTOM_PROPS);
      {
        const bm = buildBlobMap(canvas);
        if (saveJsonObj.objects) {
          for (const o of saveJsonObj.objects) fixBlobUrls(o, bm);
        }
      }
      if (saveJsonObj.objects) {
        saveJsonObj.objects = saveJsonObj.objects.filter((o: any) => {
          if (o._isDesignAreaBg || o._isGuideline || o._isPenOverlay || o._isPenPreview ||
              o._isFeatherPreview || o._isCropRect || o._isCropOverlay || o._isCropPreview) return false;
          if (o._isSolidBg) {
            if (typeof o.fill === "object") return true;
            return o.fill && o.fill !== "#ffffff" && o.fill !== "white" && o.fill !== "transparent";
          }
          return true;
        });
        for (const o of saveJsonObj.objects) {
          o.left = (o.left || 0) - BLEED_PX;
          o.top = (o.top || 0) - BLEED_PX;
        }
      }
      saveJsonObj.width = canvasWidth;
      saveJsonObj.height = canvasHeight;

      // Safety net: ensure no data:image/... URL slips into canvasState.
      // Upload any remaining base64 source to the backend and replace with URL.
      const uploadDataUrl = async (dataUrl: string): Promise<string | null> => {
        try {
          const res = await fetch(apiUrl("/api/uploads/image"), {
            credentials: "include",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return data.url || null;
        } catch { return null; }
      };
      // Strip backend domain from URLs so the JSON stays portable.
      // At load time, restoreCanvasState prepends the backend domain.
      const BACKEND_BASE = process.env.NEXT_PUBLIC_STUDIO_BACKEND_URL || "";
      const toRelativeUrl = (u: string) =>
        u.startsWith(BACKEND_BASE) ? u.slice(BACKEND_BASE.length) : u;
      const cleanAndUploadSrcs = async (list: any[]): Promise<void> => {
        if (!Array.isArray(list)) return;
        for (const o of list) {
          if (!o) continue;
          if (typeof o.src === "string") {
            if (o.src.startsWith("data:image/")) {
              const url = await uploadDataUrl(o.src);
              if (url) o.src = url;
            } else {
              o.src = toRelativeUrl(o.src);
            }
          }
          if (Array.isArray(o.objects)) await cleanAndUploadSrcs(o.objects);
        }
      };
      await cleanAndUploadSrcs(saveJsonObj.objects || []);

      const canvasJson = JSON.stringify(saveJsonObj);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shootZones: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._isShootZone) {
          shootZones.push({
            left: (o.left - BLEED_PX) * finalScale2,
            top: (o.top - BLEED_PX) * finalScale2,
            width: o.width * (o.scaleX || 1) * finalScale2,
            height: o.height * (o.scaleY || 1) * finalScale2,
            angle: o.angle || 0,
            rx: (o.rx || 0) * finalScale2,
            ry: (o.ry || 0) * finalScale2,
            stroke: o.stroke,
            strokeWidth: (o.strokeWidth || 0) * finalScale2,
            strokeDashArray: (o.strokeDashArray || []).map((v: number) => v * finalScale2),
          });
          o.set("visible", false);
        }
        if (o._isTextGuide || o._isShootLabel || o._isPenOverlay || o._isPenPreview || o._isFeatherPreview || o._isGuideline || o._isDesignAreaBg) o.set("visible", false);
        // Saved cadre should not carry preview-mode fills/persons.
        if (o._isPreviewLayer) o.set("visible", false);
      });

      // Export at full resolution — canvas buffer includes bleed, so crop to design area.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      designBgObj2 = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
      const userBgFill2 = designBgObj2 ? (typeof designBgObj2.fill === "string" ? designBgObj2.fill : "#ffffff") : "#ffffff";
      savedBgColor2 = canvas.backgroundColor;
      canvas.backgroundColor = userBgFill2;
      bgMutated = true;
      if (designBgObj2) { designBgObj2.excludeFromExport = false; designBgObj2.set("visible", true); }
      canvas.requestRenderAll();
      const dataUrl = await renderDesignArea();

      // Punch transparent holes for shoot zones, then re-composite user
      // elements that sit OVER a shoot so they stay visible in the preview.
      let finalDataUrl = dataUrl;
      let elementsOnlyUrl = "";
      if (shootZones.length > 0) {
        // Catalogue-load fidelity: also hide every _fromCatalogue object
        // whose z-index is BEFORE the last catalogue shoot — they were
        // meant to be punched by the booth's destination-out shoots and
        // would otherwise leak back into the holes when re-composited.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allObjsForBSave: any[] = canvas.getObjects();
        let lastCatShootIndexSave = -1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allObjsForBSave.forEach((o: any, i: number) => {
          if (o._isShootZone && o._fromCatalogue && i > lastCatShootIndexSave) lastCatShootIndexSave = i;
        });
        // Render B: user elements ONLY (hide ALL bg layers).
        const bgObjectsForB: { obj: any; wasVisible: boolean }[] = [];
        canvas.getObjects().forEach((o: any, i: number) => {
          const isStudioBg = o._isSolidBg || o._isDesignAreaBg || o._isBgImage || o._isGradientBg;
          const isCatalogueBelowShoots = lastCatShootIndexSave >= 0 &&
            i < lastCatShootIndexSave && o._fromCatalogue && !o._isShootZone && !o._isShootLabel;
          if (isStudioBg || isCatalogueBelowShoots) {
            bgObjectsForB.push({ obj: o, wasVisible: o.visible !== false });
            o.set("visible", false);
          }
        });
        const savedCanvasBgForB = canvas.backgroundColor;
        canvas.backgroundColor = "transparent";
        canvas.renderAll();
        elementsOnlyUrl = await renderDesignArea();
        bgObjectsForB.forEach(({ obj, wasVisible }) => obj.set("visible", wasVisible));
        canvas.backgroundColor = savedCanvasBgForB;
        canvas.renderAll();

        const offscreen = document.createElement("canvas");
        offscreen.width = targetW2;
        offscreen.height = targetH2;
        const ctx = offscreen.getContext("2d")!;
        const img = new window.Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
          img.onerror = () => reject(new Error("Save image load failed"));
          img.src = dataUrl;
        });

        ctx.globalCompositeOperation = "destination-out";
        for (const zone of shootZones) {
          ctx.save();
          if (zone.angle) {
            ctx.translate(zone.left, zone.top);
            ctx.rotate((zone.angle * Math.PI) / 180);
            ctx.translate(-zone.left, -zone.top);
          }
          const r = zone.rx || 0;
          if (r > 0) {
            const x = zone.left, y = zone.top, w = zone.width, h = zone.height;
            ctx.beginPath();
            ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath(); ctx.fill();
          } else {
            ctx.fillRect(zone.left, zone.top, zone.width, zone.height);
          }
          ctx.restore();
        }
        ctx.globalCompositeOperation = "source-over";

        const elementsImg = new window.Image();
        await new Promise<void>((resolve, reject) => {
          elementsImg.onload = () => { ctx.drawImage(elementsImg, 0, 0); resolve(); };
          elementsImg.onerror = () => reject(new Error("Elements-only image load failed"));
          elementsImg.src = elementsOnlyUrl;
        });

        for (const zone of shootZones) {
          if (!zone.strokeWidth || zone.strokeWidth <= 0) continue;
          ctx.save();
          const sw = zone.strokeWidth;
          const half = sw / 2;
          const ox = zone.left - half, oy = zone.top - half;
          const ow = zone.width + sw, oh = zone.height + sw;
          if (zone.angle) {
            ctx.translate(zone.left, zone.top);
            ctx.rotate((zone.angle * Math.PI) / 180);
            ctx.translate(-zone.left, -zone.top);
          }
          ctx.lineWidth = sw;
          if (zone.stroke && typeof zone.stroke === "object" && zone.stroke.colorStops) {
            const stops = zone.stroke.colorStops;
            const grad = zone.stroke.type === "radial"
              ? ctx.createRadialGradient(zone.left + zone.width / 2, zone.top + zone.height / 2, 0, zone.left + zone.width / 2, zone.top + zone.height / 2, Math.max(ow, oh) / 2)
              : ctx.createLinearGradient(ox, oy, ox + ow, oy + oh);
            for (const s of stops) grad.addColorStop(s.offset, s.color);
            ctx.strokeStyle = grad;
          } else if (typeof zone.stroke === "string") {
            ctx.strokeStyle = zone.stroke;
          } else { ctx.restore(); continue; }
          const r = (zone.rx || 0) + half;
          if (r > 0) {
            ctx.beginPath();
            ctx.moveTo(ox + r, oy); ctx.lineTo(ox + ow - r, oy);
            ctx.quadraticCurveTo(ox + ow, oy, ox + ow, oy + r);
            ctx.lineTo(ox + ow, oy + oh - r);
            ctx.quadraticCurveTo(ox + ow, oy + oh, ox + ow - r, oy + oh);
            ctx.lineTo(ox + r, oy + oh);
            ctx.quadraticCurveTo(ox, oy + oh, ox, oy + oh - r);
            ctx.lineTo(ox, oy + r);
            ctx.quadraticCurveTo(ox, oy, ox + r, oy);
            ctx.closePath(); ctx.stroke();
          } else {
            ctx.strokeRect(ox, oy, ow, oh);
          }
          ctx.restore();
        }

        finalDataUrl = offscreen.toDataURL("image/png");
        offscreen.width = 0; offscreen.height = 0;
      }

      // ── Generate thumbnail: shoots filled #999 + camera icon, resized to max 500px ──
      const THUMB_MAX = 500;
      let thumbDataUrl = "";
      try {
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = targetW2;
        thumbCanvas.height = targetH2;
        const tctx = thumbCanvas.getContext("2d")!;
        // Fill background white (JPG has no transparency)
        tctx.fillStyle = "#ffffff";
        tctx.fillRect(0, 0, targetW2, targetH2);
        // Draw the base render (bg + elements, no shoots) — force exact dimensions
        const baseImg = new window.Image();
        await new Promise<void>((resolve, reject) => {
          baseImg.onload = () => { tctx.drawImage(baseImg, 0, 0, targetW2, targetH2); resolve(); };
          baseImg.onerror = () => reject(new Error("Thumb base load failed"));
          baseImg.src = dataUrl;
        });
        // Fill shoot zones with #999 + camera icon
        for (const zone of shootZones) {
          tctx.save();
          if (zone.angle) {
            tctx.translate(zone.left, zone.top);
            tctx.rotate((zone.angle * Math.PI) / 180);
            tctx.translate(-zone.left, -zone.top);
          }
          const r = zone.rx || 0;
          // Clip to rounded rect if needed
          tctx.beginPath();
          if (r > 0) {
            const x = zone.left, y = zone.top, w = zone.width, h = zone.height;
            tctx.moveTo(x + r, y); tctx.lineTo(x + w - r, y);
            tctx.quadraticCurveTo(x + w, y, x + w, y + r);
            tctx.lineTo(x + w, y + h - r);
            tctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            tctx.lineTo(x + r, y + h);
            tctx.quadraticCurveTo(x, y + h, x, y + h - r);
            tctx.lineTo(x, y + r);
            tctx.quadraticCurveTo(x, y, x + r, y);
            tctx.closePath();
          } else {
            tctx.rect(zone.left, zone.top, zone.width, zone.height);
          }
          tctx.fillStyle = "#999999";
          tctx.fill();
          // Camera icon (SVG path drawn at center of zone)
          const iconSize = Math.min(zone.width, zone.height) * 0.25;
          const cx = zone.left + zone.width / 2;
          const cy = zone.top + zone.height / 2;
          const s = iconSize / 24; // SVG viewBox is 24x24
          tctx.translate(cx - 12 * s, cy - 12 * s);
          tctx.scale(s, s);
          tctx.fillStyle = "rgba(255,255,255,0.5)";
          // Camera body
          tctx.beginPath();
          tctx.moveTo(4, 6); tctx.lineTo(8.25, 6); tctx.lineTo(9.83, 4); tctx.lineTo(14.17, 4);
          tctx.lineTo(15.75, 6); tctx.lineTo(20, 6);
          tctx.quadraticCurveTo(21, 6, 21, 7); tctx.lineTo(21, 19);
          tctx.quadraticCurveTo(21, 20, 20, 20); tctx.lineTo(4, 20);
          tctx.quadraticCurveTo(3, 20, 3, 19); tctx.lineTo(3, 7);
          tctx.quadraticCurveTo(3, 6, 4, 6);
          tctx.closePath();
          tctx.fill();
          // Lens circle
          tctx.beginPath();
          tctx.arc(12, 13, 4, 0, Math.PI * 2);
          tctx.fillStyle = "rgba(153,153,153,0.8)";
          tctx.fill();
          tctx.lineWidth = 1.5;
          tctx.strokeStyle = "rgba(255,255,255,0.5)";
          tctx.stroke();
          tctx.restore();
          // Draw stroke border if any
          if (zone.strokeWidth && zone.strokeWidth > 0) {
            tctx.save();
            if (zone.angle) {
              tctx.translate(zone.left, zone.top);
              tctx.rotate((zone.angle * Math.PI) / 180);
              tctx.translate(-zone.left, -zone.top);
            }
            tctx.lineWidth = zone.strokeWidth;
            if (typeof zone.stroke === "string") tctx.strokeStyle = zone.stroke;
            else tctx.strokeStyle = "#666";
            tctx.beginPath();
            if (r > 0) {
              const x = zone.left, y = zone.top, w = zone.width, h = zone.height;
              tctx.moveTo(x + r, y); tctx.lineTo(x + w - r, y);
              tctx.quadraticCurveTo(x + w, y, x + w, y + r);
              tctx.lineTo(x + w, y + h - r);
              tctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
              tctx.lineTo(x + r, y + h);
              tctx.quadraticCurveTo(x, y + h, x, y + h - r);
              tctx.lineTo(x, y + r);
              tctx.quadraticCurveTo(x, y, x + r, y);
              tctx.closePath();
            } else {
              tctx.rect(zone.left, zone.top, zone.width, zone.height);
            }
            tctx.stroke();
            tctx.restore();
          }
        }
        // Re-composite user elements on top
        if (elementsOnlyUrl) {
          const elImg = new window.Image();
          await new Promise<void>((resolve, reject) => {
            elImg.onload = () => { tctx.drawImage(elImg, 0, 0, targetW2, targetH2); resolve(); };
            elImg.onerror = () => reject(new Error("Thumb elements load failed"));
            elImg.src = elementsOnlyUrl;
          });
        }
        // Resize to max 500px
        const tw = thumbCanvas.width;
        const th = thumbCanvas.height;
        const thumbScale = Math.min(THUMB_MAX / tw, THUMB_MAX / th, 1);
        const nw = Math.round(tw * thumbScale);
        const nh = Math.round(th * thumbScale);
        const resized = document.createElement("canvas");
        resized.width = nw; resized.height = nh;
        resized.getContext("2d")!.drawImage(thumbCanvas, 0, 0, nw, nh);
        thumbDataUrl = resized.toDataURL("image/jpeg", 0.85);
        resized.width = 0; resized.height = 0;
        thumbCanvas.width = 0; thumbCanvas.height = 0;
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
        // Fallback: use finalDataUrl as thumbnail
        thumbDataUrl = finalDataUrl;
      }

      // Restore shoot zones & guides now that base64 is captured, so the user
      // doesn't see them disappear while the HTTP request is in flight.
      if (bgMutated) {
        canvas.backgroundColor = savedBgColor2;
        if (designBgObj2) designBgObj2.excludeFromExport = true;
        bgMutated = false;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._isShootZone || o._isTextGuide || o._isShootLabel || o._isPenOverlay || o._isPenPreview || o._isFeatherPreview || o._isGuideline || o._isDesignAreaBg) o.set("visible", true);
        if (o._isPreviewLayer) o.set("visible", true);
      });
      canvas.requestRenderAll();

      const savePayload: FrameSavePayload = {
        name: format.name,
        formatId: format.id,
        gabaritId: gabarit.id,
        shootCount: shootZones.length,
        imageDataUrl: finalDataUrl,
        thumbnailDataUrl: thumbDataUrl,
        canvasState: canvasJson,
      };

      // Sauvegarde déléguée (éditeur public) : on court-circuite les routes
      // bibliothèques/événements. Le `finally` restaure quand même le canvas.
      if (saveHandler) {
        try {
          const result = await saveHandler(savePayload);
          toast(frameId ? "Mise à jour avec succès !" : "Enregistré avec succès !", "success");
          onSaved(result?.id);
        } catch (err) {
          console.error("Save handler failed:", err);
          // Le message du serveur dit quoi corriger (format, nombre de poses, taille…)
          toast(err instanceof Error && err.message ? err.message : "Erreur lors de la sauvegarde.", "error");
        }
        return;
      }

      const url = catalogMode
        ? (frameId ? apiUrl(`/api/bibliotheques/${frameId}`) : apiUrl("/api/bibliotheques"))
        : frameId
          ? apiUrl(`/api/events/${eventId}/frames/${frameId}`)
          : apiUrl(`/api/events/${eventId}/frames`);
      try {
        const res = await fetchWithTimeout(url, {
          method: frameId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(savePayload),
          timeoutMs: 60000,
        });

        if (res.ok) {
          const resData = await res.json().catch(() => null);
          const createdId = resData?.id;
          toast(frameId ? "Mise à jour avec succès !" : "Enregistré avec succès !", "success");
          onSaved(createdId);
        } else {
          toast("Erreur lors de la sauvegarde.", "error");
        }
      } catch {
        toast("Erreur réseau lors de la sauvegarde.", "error");
      }
    } catch (err) {
      console.error("Save failed:", err);
      toast("Erreur lors de l'export de la sauvegarde.", "error");
    } finally {
      // Always restore canvas state regardless of success or failure
      if (bgMutated) {
        canvas.backgroundColor = savedBgColor2;
        if (designBgObj2) designBgObj2.excludeFromExport = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._isShootZone || o._isTextGuide || o._isShootLabel || o._isPenOverlay || o._isPenPreview || o._isFeatherPreview || o._isGuideline || o._isDesignAreaBg) o.set("visible", true);
        if (o._isPreviewLayer) o.set("visible", true);
      });
      canvas.requestRenderAll();
      setSaving(false);
    }
  }, [
    fabricRef, saving, canvasWidth, canvasHeight, frameName, frameId, eventId, catalogMode,
    format, gabarit, setSaving, onSaved, cropToDesignArea, checkPrintMargins,
    generateMarginPreview, saveHandler,
  ]);

  return {
    // Share state
    shareUrl,
    setShareUrl,
    showShareModal,
    setShowShareModal,
    shareAccess,
    setShareAccess,
    shareCopied,
    setShareCopied,
    shareEmailTo,
    setShareEmailTo,
    shareEmailMsg,
    setShareEmailMsg,
    shareEmailSending,
    setShareEmailSending,
    shareEmailSent,
    setShareEmailSent,

    // Margin check state
    marginWarnings,
    setMarginWarnings: setMarginWarningsLocal,
    marginCheckPreview,
    setMarginCheckPreview: setMarginCheckPreviewLocal,
    pendingSaveAfterCheck,
    setPendingSaveAfterCheck: setPendingSaveAfterCheckLocal,
    showMarginCheck,
    setShowMarginCheck: setShowMarginCheckLocal,

    // Save / version state
    lastSavedAt,
    setLastSavedAt,
    saveStatus,
    setSaveStatus,
    showVersions,
    setShowVersions,
    versionHistory,
    setVersionHistory,

    // Functions
    handleShare,
    copyShareLink,
    cropToDesignArea,
    handleDownloadPNG,
    renderDesignArea,
    checkPrintMargins,
    generateMarginPreview,
    handleSave,
  };
}
