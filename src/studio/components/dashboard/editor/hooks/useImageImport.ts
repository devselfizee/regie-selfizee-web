"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "../../Toast";
import { apiUrl, apiFetchOptions } from "@/studio/lib/api";
import { logStudioError } from "@/studio/lib/studioLog";

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const resolveServedUrl = (u: string) =>
  /^https?:\/\//i.test(u) ? u : `${BACKEND_BASE}${u.startsWith("/") ? "" : "/"}${u}`;

// Fire-and-forget: upload a data URL to /api/uploads/image, then swap the
// FabricImage's source with the permanent URL. Silently falls back to the
// original data URL on failure so the visual state is unaffected.
async function uploadAndSwapImageSrc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  img: any,
  dataUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canvas: any,
) {
  try {
    const res = await fetch(apiUrl("/api/uploads/image"), {
      ...apiFetchOptions,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const displayUrl = resolveServedUrl(data.url);
    // Only swap if the image is still on the canvas — the user may have
    // removed it before the upload finished.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!canvas.getObjects().includes(img)) return;
    // Use absolute URL for display; Fabric stores it as src.
    // At save time, toObject() captures this absolute URL, but
    // restoreCanvasState resolves /uploads/... → backend on load.
    if (typeof img.setSrc === "function") {
      await img.setSrc(displayUrl, { crossOrigin: "anonymous" });
    } else {
      img.set("src", displayUrl);
    }
    canvas.requestRenderAll();
  } catch {
    /* network error — keep the data URL, user still sees the image */
  }
}
import {
  getTempCanvas, releaseTempCanvas, downscaleDataUrl,
  loadPdfjs, loadPsd, loadUtif, loadHeic2any,
  randomId,
} from "../canvas/canvasUtils";

/* ═══════════════════════════════════════════════════════════════
   Image import hook — handles all file formats:
   PNG, JPG, WebP, AVIF, SVG, PDF, AI, EPS, PSD, TIFF, HEIC/HEIF
   ═══════════════════════════════════════════════════════════════ */

interface UseImageImportParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
}

export interface PdfPage {
  pageNum: number;
  dataUrl: string;
}

const UPLOAD_STORAGE_KEY = "selfizee_upload_history";

export interface UploadHistoryEntry {
  id: string;
  dataUrl: string;
  name: string;
  date: number;
}

export function useImageImport({ fabricRef, canvasWidth, canvasHeight, BLEED_PX }: UseImageImportParams) {
  // Upload history
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryEntry[]>([]);
  const [pdfPages, setPdfPages] = useState<PdfPage[]>([]);
  const [showPdfPicker, setShowPdfPicker] = useState(false);
  const [pdfFileName, setPdfFileName] = useState("");
  // Confirmation dialog for bg image replacement
  const [showBgReplaceConfirm, setShowBgReplaceConfirm] = useState(false);
  const [loadingBg, setLoadingBg] = useState(false);
  const [pendingBgDataUrl, setPendingBgDataUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(UPLOAD_STORAGE_KEY);
      if (stored) setUploadHistory(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Accepts either an array OR an updater function — so multi-file imports
  // inside a single render can chain off the freshest state instead of
  // stomping each other's closure-captured snapshot (only the last file
  // would survive otherwise).
  const saveUploadHistory = useCallback(
    (itemsOrUpdater: UploadHistoryEntry[] | ((prev: UploadHistoryEntry[]) => UploadHistoryEntry[])) => {
      setUploadHistory((prev) => {
        const next = typeof itemsOrUpdater === "function"
          ? itemsOrUpdater(prev)
          : itemsOrUpdater;
        const trimmed = next.slice(0, 20);
        try { localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* quota */ }
        return trimmed;
      });
    },
    [],
  );

  // Internal: actually place a bg image on canvas (after confirmation if needed)
  const _placeBgImage = useCallback(
    async (dataUrl: string) => {
      const fabric = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;
      setLoadingBg(true);
      try {
        const isRemoteUrl = /^https?:\/\//i.test(dataUrl);
        // For remote URLs (Pexels/Pixabay): use the URL directly with CORS
        // anonymous, no downscaling/base64 conversion.
        // For local data URLs: downscale first; the caller kicks off a
        // background upload and swaps img src once the URL is known.
        const finalSrc = isRemoteUrl ? dataUrl : await downscaleDataUrl(dataUrl);
        const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = "anonymous";
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = finalSrc;
        });
        const img = new fabric.FabricImage(imgEl, { objectCaching: false, crossOrigin: "anonymous" });
        const scaleX = canvasWidth / img.width!;
        const scaleY = canvasHeight / img.height!;
        const scale = Math.max(scaleX, scaleY);
        img.set({ scaleX: scale, scaleY: scale, left: BLEED_PX, top: BLEED_PX, originX: 'left', originY: 'top', selectable: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (img as any)._isBgImage = true;
        // Remove existing bg images + legacy gradient objects (solidBg stays untouched)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvas.getObjects().filter((o: any) => o._isBgImage || o._isGradientBg).forEach((o: any) => canvas.remove(o));
        canvas.add(img);
        // Ensure layer order: designAreaBg → solidBg → bgImage → user content
        canvas.sendObjectToBack(img);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
        if (solidBg) canvas.sendObjectToBack(solidBg);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const daBg = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
        if (daBg) canvas.sendObjectToBack(daBg);
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: img, _historyLabel: "Image de fond ajoutée" });
      } catch (err) {
        toast("Impossible de charger l'image", "error");
        logStudioError("import_image", err, {
          source: "useImageImport._placeBgImage",
          details: { isBg: true },
        });
      } finally {
        setLoadingBg(false);
      }
    },
    [fabricRef, canvasWidth, canvasHeight, BLEED_PX]
  );

  // Confirm pending bg replacement
  const confirmBgReplace = useCallback(() => {
    if (pendingBgDataUrl) {
      _placeBgImage(pendingBgDataUrl);
      setPendingBgDataUrl(null);
    }
    setShowBgReplaceConfirm(false);
  }, [pendingBgDataUrl, _placeBgImage]);

  const cancelBgReplace = useCallback(() => {
    setPendingBgDataUrl(null);
    setShowBgReplaceConfirm(false);
  }, []);

  const addImageToCanvas = useCallback(
    async (dataUrl: string, isBg: boolean, fillRatio = 0.7) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      if (isBg) {
        // Check if there's already a bg image — prompt for replacement
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingBgImage = canvas.getObjects().find((o: any) => o._isBgImage);
        if (existingBgImage) {
          setPendingBgDataUrl(dataUrl);
          setShowBgReplaceConfirm(true);
          return;
        }
        _placeBgImage(dataUrl);
      } else {
        const fabric = await import("fabric");
        const isRemoteUrl = /^https?:\/\//i.test(dataUrl);
        const finalSrc = isRemoteUrl ? dataUrl : await downscaleDataUrl(dataUrl);
        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        imgEl.onerror = () => { toast("Impossible de charger l'image", "error"); };
        imgEl.onload = () => {
          const img = new fabric.FabricImage(imgEl, { objectCaching: false, crossOrigin: "anonymous" });
          const maxW = canvasWidth * fillRatio;
          const maxH = canvasHeight * fillRatio;
          const scale = Math.min(maxW / img.width!, maxH / img.height!);
          img.set({
            scaleX: scale, scaleY: scale,
            left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2,
            originX: "center", originY: "center",
          });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.requestRenderAll();
          // For local uploads (data URLs): fire-and-forget upload to backend,
          // then swap the image src with the returned URL so canvasState
          // stores a permanent reference instead of the base64 blob.
          if (!isRemoteUrl) uploadAndSwapImageSrc(img, finalSrc, canvas);
        };
        imgEl.src = finalSrc;
      }
    },
    [fabricRef, canvasWidth, canvasHeight, BLEED_PX, _placeBgImage]
  );

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, isBg: boolean) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) {
        toast("Le fichier est trop volumineux (max 50 Mo).", "warning");
        e.target.value = "";
        return;
      }

      const fileName = file.name.toLowerCase();
      const isEps = fileName.endsWith(".eps");
      const isPdfLike = file.type === "application/pdf" || fileName.endsWith(".pdf") || fileName.endsWith(".ai") || isEps;

      // ── PDF / AI / EPS ──
      if (isPdfLike) {
        const arrayBuffer = await file.arrayBuffer();
        let imported = false;

        try {
          const pdfjsLib = await loadPdfjs();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const pages: { pageNum: number; dataUrl: string; _canvas?: HTMLCanvasElement }[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const offscreen = getTempCanvas(viewport.width, viewport.height);
            const ctx = offscreen.getContext("2d")!;
            await page.render({ canvasContext: ctx, viewport } as any).promise;
            pages.push({ pageNum: i, dataUrl: offscreen.toDataURL("image/png"), _canvas: offscreen });
          }
          const isBlank = (cvs: HTMLCanvasElement) => {
            const ctx2 = cvs.getContext("2d")!;
            const imgData = ctx2.getImageData(0, 0, cvs.width, cvs.height);
            const d = imgData.data;
            const step = Math.max(4, Math.floor(d.length / 4000) * 4);
            for (let i = 0; i < d.length; i += step) {
              if (d[i + 3] > 10 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) return false;
            }
            return true;
          };
          const hasContent = pages.some(p => !isBlank(p._canvas!));
          pages.forEach(p => { if (p._canvas) { releaseTempCanvas(p._canvas); p._canvas = undefined; } });
          if (hasContent) {
            if (pages.length === 1) {
              addImageToCanvas(pages[0].dataUrl, isBg);
              saveUploadHistory((prev) => [{ id: randomId(), dataUrl: pages[0].dataUrl, name: file.name, date: Date.now() }, ...prev]);
            } else {
              setPdfPages(pages.map(p => ({ pageNum: p.pageNum, dataUrl: p.dataUrl })));
              setPdfFileName(file.name);
              setShowPdfPicker(true);
            }
            imported = true;
          }
        } catch (err) {
          logStudioError("import_pdf", err, {
            source: "useImageImport.pdfjs",
            details: { fileName: file.name, size: file.size, isEps },
          });
        }

        // EPS Ghostscript fallback
        if (!imported && isEps) {
          try {
            const formData = new FormData();
            formData.append("file", new Blob([arrayBuffer]), file.name);
            const { fetchWithTimeout } = await import("../canvas/canvasUtils");
            const resp = await fetchWithTimeout(apiUrl("/api/convert-eps"), { method: "POST", body: formData, timeoutMs: 90000 });
            if (resp.ok) {
              const result = await resp.json();
              if (result.dataUrl) {
                addImageToCanvas(result.dataUrl, isBg);
                saveUploadHistory((prev) => [{ id: randomId(), dataUrl: result.dataUrl, name: file.name, date: Date.now() }, ...prev]);
                imported = true;
              } else if (result.pdf) {
                try {
                  const pdfjsLib = await loadPdfjs();
                  const pdfData = atob(result.pdf.split(",")[1]);
                  const pdfArray = new Uint8Array(pdfData.length);
                  for (let i = 0; i < pdfData.length; i++) pdfArray[i] = pdfData.charCodeAt(i);
                  const pdf = await pdfjsLib.getDocument({ data: pdfArray }).promise;
                  const page = await pdf.getPage(1);
                  const viewport = page.getViewport({ scale: 2 });
                  const offscreen = getTempCanvas(viewport.width, viewport.height);
                  await page.render({ canvasContext: offscreen.getContext("2d")!, viewport } as any).promise;
                  const renderedUrl = offscreen.toDataURL("image/png");
                  releaseTempCanvas(offscreen);
                  addImageToCanvas(renderedUrl, isBg);
                  saveUploadHistory((prev) => [{ id: randomId(), dataUrl: renderedUrl, name: file.name, date: Date.now() }, ...prev]);
                  imported = true;
                } catch (err) {
                  logStudioError("import_eps", err, {
                    source: "useImageImport.eps.pdfRender",
                    details: { fileName: file.name },
                  });
                }
              }
            }
          } catch (err) {
            logStudioError("import_eps", err, {
              source: "useImageImport.eps.api",
              details: { fileName: file.name, size: file.size },
            });
          }
        }

        // EPS TIFF preview fallback
        if (!imported && isEps) {
          try {
            const data = new Uint8Array(arrayBuffer);
            const magic = (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
            if (magic === 0xC6D3D0C5) {
              const tiffOffset = data[20] | (data[21] << 8) | (data[22] << 16) | (data[23] << 24);
              const tiffLength = data[24] | (data[25] << 8) | (data[26] << 16) | (data[27] << 24);
              if (tiffOffset > 0 && tiffLength > 0 && tiffOffset + tiffLength <= data.length) {
                const tiffData = data.slice(tiffOffset, tiffOffset + tiffLength);
                const UTIF = await loadUtif();
                const ifds = UTIF.decode(tiffData.buffer);
                if (ifds.length > 0) {
                  UTIF.decodeImage(tiffData.buffer, ifds[0]);
                  const rgba = UTIF.toRGBA8(ifds[0]);
                  const w = ifds[0].width, h = ifds[0].height;
                  if (w > 0 && h > 0 && w <= 10000 && h <= 10000) {
                    const c = getTempCanvas(w, h);
                    const ctx = c.getContext("2d")!;
                    const imgData = ctx.createImageData(w, h);
                    imgData.data.set(new Uint8Array(rgba));
                    ctx.putImageData(imgData, 0, 0);
                    const dataUrl = c.toDataURL("image/png");
                    releaseTempCanvas(c);
                    addImageToCanvas(dataUrl, isBg);
                    saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
                    imported = true;
                  }
                }
              }
            }
          } catch (err) {
            logStudioError("import_eps", err, {
              source: "useImageImport.eps.tiffPreview",
              details: { fileName: file.name },
            });
          }
        }

        // EPS EPSI preview fallback
        if (!imported && isEps) {
          try {
            const text = new TextDecoder("ascii").decode(new Uint8Array(arrayBuffer));
            const previewMatch = text.match(/%%BeginPreview:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)([\s\S]*?)%%EndPreview/);
            if (previewMatch) {
              const pw = parseInt(previewMatch[1]);
              const ph = parseInt(previewMatch[2]);
              const depth = parseInt(previewMatch[3]);
              if (pw > 0 && ph > 0 && pw <= 10000 && ph <= 10000) {
                const hexLines = previewMatch[5].split("\n").filter((l: string) => l.startsWith("%")).map((l: string) => l.substring(1).trim());
                const hexStr = hexLines.join("");
                const bytes: number[] = [];
                for (let i = 0; i < hexStr.length; i += 2) bytes.push(parseInt(hexStr.substring(i, i + 2), 16));
                const c = getTempCanvas(pw, ph);
                const ctx = c.getContext("2d")!;
                const imgData = ctx.createImageData(pw, ph);
                if (depth === 1) {
                  const rowBytes = Math.ceil(pw / 8);
                  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
                    const bit = (bytes[y * rowBytes + Math.floor(x / 8)] >> (7 - (x % 8))) & 1;
                    const val = bit ? 0 : 255;
                    const pi = (y * pw + x) * 4;
                    imgData.data[pi] = val; imgData.data[pi + 1] = val; imgData.data[pi + 2] = val; imgData.data[pi + 3] = 255;
                  }
                } else {
                  for (let i = 0; i < pw * ph && i < bytes.length; i++) {
                    const pi = i * 4;
                    imgData.data[pi] = bytes[i]; imgData.data[pi + 1] = bytes[i]; imgData.data[pi + 2] = bytes[i]; imgData.data[pi + 3] = 255;
                  }
                }
                ctx.putImageData(imgData, 0, 0);
                const dataUrl = c.toDataURL("image/png");
                releaseTempCanvas(c);
                addImageToCanvas(dataUrl, isBg);
                saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
                imported = true;
              }
            }
          } catch (err) {
            logStudioError("import_eps", err, {
              source: "useImageImport.eps.epsiPreview",
              details: { fileName: file.name },
            });
          }
        }

        if (!imported) {
          const ext = fileName.split(".").pop()?.toUpperCase() || "PDF";
          toast(isEps
            ? "Impossible d'importer ce fichier EPS. Téléchargez plutôt la version SVG depuis le site source."
            : `Erreur import ${ext}. Vérifiez que le fichier est valide.`, "error");
        }
        e.target.value = "";
        return;
      }

      // ── PSD ──
      if (fileName.endsWith(".psd")) {
        try {
          const Psd = await loadPsd();
          const ab = await file.arrayBuffer();
          const psd = Psd.parse(ab);
          if (psd.width > 10000 || psd.height > 10000 || psd.width * psd.height > 25000000) {
            toast("Fichier PSD trop volumineux (max 10000×10000px)", "error"); throw new Error("PSD too large");
          }
          const composite = await psd.composite();
          const c = getTempCanvas(psd.width, psd.height);
          const ctx = c.getContext("2d")!;
          const imgData = ctx.createImageData(psd.width, psd.height);
          imgData.data.set(composite);
          ctx.putImageData(imgData, 0, 0);
          const dataUrl = c.toDataURL("image/png");
          releaseTempCanvas(c);
          addImageToCanvas(dataUrl, isBg);
          saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
        } catch (err) {
          toast("Erreur lors de l'import du fichier PSD.", "error");
          logStudioError("import_psd", err, {
            source: "useImageImport.psd",
            details: { fileName: file.name, size: file.size },
          });
        }
        e.target.value = "";
        return;
      }

      // ── TIFF ──
      if (fileName.endsWith(".tiff") || fileName.endsWith(".tif")) {
        try {
          const UTIF = await loadUtif();
          const ab = await file.arrayBuffer();
          const ifds = UTIF.decode(ab);
          if (!ifds[0] || ifds[0].width > 10000 || ifds[0].height > 10000) {
            toast("Fichier TIFF trop volumineux (max 10000×10000px)", "error"); e.target.value = ""; return;
          }
          UTIF.decodeImage(ab, ifds[0]);
          const rgba = UTIF.toRGBA8(ifds[0]);
          const c = getTempCanvas(ifds[0].width, ifds[0].height);
          const ctx = c.getContext("2d")!;
          const imgData = ctx.createImageData(ifds[0].width, ifds[0].height);
          imgData.data.set(new Uint8ClampedArray(rgba));
          ctx.putImageData(imgData, 0, 0);
          const dataUrl = c.toDataURL("image/png");
          releaseTempCanvas(c);
          addImageToCanvas(dataUrl, isBg);
          saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
        } catch (err) {
          toast("Erreur lors de l'import du fichier TIFF.", "error");
          logStudioError("import_tiff", err, {
            source: "useImageImport.tiff",
            details: { fileName: file.name, size: file.size },
          });
        }
        e.target.value = "";
        return;
      }

      // ── HEIC/HEIF ──
      if (fileName.endsWith(".heic") || fileName.endsWith(".heif")) {
        try {
          const heic2any = await loadHeic2any();
          const blob = await heic2any({ blob: file, toType: "image/png" }) as Blob;
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader2 = new FileReader();
            reader2.onload = (ev2) => resolve(ev2.target?.result as string);
            reader2.onerror = () => reject(new Error("HEIC read failed"));
            reader2.readAsDataURL(blob);
          });
          addImageToCanvas(dataUrl, isBg);
          saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
        } catch (err) {
          toast("Erreur lors de l'import du fichier HEIC.", "error");
          logStudioError("import_heic", err, {
            source: "useImageImport.heic",
            details: { fileName: file.name, size: file.size },
          });
        }
        e.target.value = "";
        return;
      }

      // ── SVG ──
      if (file.type === "image/svg+xml" || fileName.endsWith(".svg")) {
        try {
          const svgText = await file.text();
          const fabric = await import("fabric");
          const result = await fabric.loadSVGFromString(svgText);
          const validObjects = result.objects.filter(Boolean) as any[];
          if (!validObjects.length) { toast("SVG vide ou non supporté", "error"); e.target.value = ""; return; }
          const group = fabric.util.groupSVGElements(validObjects, result.options);
          const canvas = fabricRef.current;
          if (!canvas) { e.target.value = ""; return; }
          if (isBg) {
            const scale = Math.max(canvasWidth / (group.width || 1), canvasHeight / (group.height || 1));
            group.set({ scaleX: scale, scaleY: scale, left: BLEED_PX, top: BLEED_PX, originX: 'left', originY: 'top', selectable: true });
            (group as any)._isBgImage = true;
            // Remove existing bg images + legacy gradient (solidBg stays untouched)
            canvas.getObjects().filter((o: any) => o._isBgImage || o._isGradientBg).forEach((o: any) => canvas.remove(o));
            canvas.add(group);
            canvas.sendObjectToBack(group);
            // Ensure layer order: designAreaBg → solidBg → bgImage
            const solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
            if (solidBg) canvas.sendObjectToBack(solidBg);
            const daBg = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
            if (daBg) canvas.sendObjectToBack(daBg);
          } else {
            const scale = Math.min(canvasWidth * 0.7 / (group.width || 1), canvasHeight * 0.7 / (group.height || 1));
            group.set({ scaleX: scale, scaleY: scale, left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2, originX: "center", originY: "center" });
            canvas.add(group);
            canvas.setActiveObject(group);
          }
          canvas.requestRenderAll();
          // Thumbnail for upload history
          const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
          const svgUrl = URL.createObjectURL(svgBlob);
          const thumbImg = new Image();
          thumbImg.onload = () => {
            const tc = getTempCanvas(200, 200);
            const tctx = tc.getContext("2d")!;
            tctx.fillStyle = "#f0f0f0"; tctx.fillRect(0, 0, 200, 200);
            const s = Math.min(180 / thumbImg.width, 180 / thumbImg.height);
            tctx.drawImage(thumbImg, (200 - thumbImg.width * s) / 2, (200 - thumbImg.height * s) / 2, thumbImg.width * s, thumbImg.height * s);
            URL.revokeObjectURL(svgUrl);
            saveUploadHistory((prev) => [{ id: randomId(), dataUrl: tc.toDataURL("image/png"), name: file.name, date: Date.now() }, ...prev]);
            releaseTempCanvas(tc);
          };
          thumbImg.onerror = () => URL.revokeObjectURL(svgUrl);
          thumbImg.src = svgUrl;
        } catch (err) {
          toast("Erreur lors de l'import du SVG.", "error");
          logStudioError("import_svg", err, {
            source: "useImageImport.svg",
            details: { fileName: file.name, size: file.size },
          });
        }
        e.target.value = "";
        return;
      }

      // ── Regular image (PNG, JPG, WebP, AVIF, etc.) ──
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        addImageToCanvas(dataUrl, isBg);
        saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
      };
      reader.onerror = () => {
        toast("Erreur lors de la lecture du fichier.", "error");
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [fabricRef, addImageToCanvas, saveUploadHistory, canvasWidth, canvasHeight, BLEED_PX]
  );

  return {
    addImageToCanvas,
    handleImageUpload,
    uploadHistory,
    saveUploadHistory,
    pdfPages, setPdfPages,
    showPdfPicker, setShowPdfPicker,
    pdfFileName, setPdfFileName,
    showBgReplaceConfirm, confirmBgReplace, cancelBgReplace,
    loadingBg,
  };
}
