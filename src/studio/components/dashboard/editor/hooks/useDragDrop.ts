"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "../../Toast";
import { apiUrl } from "@/studio/lib/api";
import {
  getTempCanvas, releaseTempCanvas,
  loadPdfjs, loadPsd, loadUtif, loadHeic2any,
  randomId,
} from "../canvas/canvasUtils";
import type { UploadHistoryEntry } from "./useImageImport";

/* ═══════════════════════════════════════════════════════════════
   Drag & drop hook — handles file drops onto the canvas.
   Supports all image formats: PNG, JPG, SVG, PDF, PSD, TIFF, HEIC…
   ═══════════════════════════════════════════════════════════════ */

interface UseDragDropParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fabricRef: React.MutableRefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  addImageToCanvas: (dataUrl: string, isBg: boolean, fillRatio?: number) => Promise<void>;
  saveUploadHistory: (itemsOrUpdater: UploadHistoryEntry[] | ((prev: UploadHistoryEntry[]) => UploadHistoryEntry[])) => void;
  setPdfPages: (pages: { pageNum: number; dataUrl: string }[]) => void;
  setPdfFileName: (name: string) => void;
  setShowPdfPicker: (show: boolean) => void;
}

export function useDragDrop({
  fabricRef, canvasWidth, canvasHeight, BLEED_PX,
  addImageToCanvas, saveUploadHistory,
  setPdfPages, setPdfFileName, setShowPdfPicker,
}: UseDragDropParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCountRef = useRef(0);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      dragCountRef.current = 0;

      const allFiles = Array.from(e.dataTransfer.files);
      const specialExts = [".psd", ".tiff", ".tif", ".heic", ".heif"];
      const pdfExts = [".pdf", ".ai", ".eps"];
      const imageFiles = allFiles.filter((f) => {
        const n = f.name.toLowerCase();
        return f.type.startsWith("image/") && !specialExts.some((ext) => n.endsWith(ext));
      });
      const pdfFiles = allFiles.filter((f) => {
        const n = f.name.toLowerCase();
        return f.type === "application/pdf" || pdfExts.some((ext) => n.endsWith(ext));
      });
      const specialFiles = allFiles.filter((f) => {
        const n = f.name.toLowerCase();
        return specialExts.some((ext) => n.endsWith(ext));
      });

      if (imageFiles.length === 0 && pdfFiles.length === 0 && specialFiles.length === 0) return;

      const fabric = await import("fabric");
      const canvas = fabricRef.current;
      if (!canvas) return;

      setIsUploading(true);
      try {
        // ── PDF / AI / EPS ──
        for (const file of pdfFiles) {
          const fName = file.name.toLowerCase();
          const isEpsFile = fName.endsWith(".eps");
          const arrayBuffer = await file.arrayBuffer();
          let imported = false;

          try {
            const pdfjs = await loadPdfjs();
            const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const pages: { pageNum: number; dataUrl: string; _canvas?: HTMLCanvasElement }[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 2 });
              const offscreen = getTempCanvas(viewport.width, viewport.height);
              await page.render({ canvasContext: offscreen.getContext("2d")!, viewport } as any).promise;
              pages.push({ pageNum: i, dataUrl: offscreen.toDataURL("image/png"), _canvas: offscreen });
            }
            const isBlankPage = (cvs: HTMLCanvasElement) => {
              const d = cvs.getContext("2d")!.getImageData(0, 0, cvs.width, cvs.height).data;
              const step = Math.max(4, Math.floor(d.length / 4000) * 4);
              for (let i = 0; i < d.length; i += step) {
                if (d[i + 3] > 10 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) return false;
              }
              return true;
            };
            const hasContent = pages.some(p => !isBlankPage(p._canvas!));
            pages.forEach(p => { if (p._canvas) { releaseTempCanvas(p._canvas); p._canvas = undefined; } });
            if (hasContent) {
              if (pages.length === 1) {
                addImageToCanvas(pages[0].dataUrl, false, 0.9);
                saveUploadHistory((prev) => [{ id: randomId(), dataUrl: pages[0].dataUrl, name: file.name, date: Date.now() }, ...prev]);
              } else {
                setPdfPages(pages.map(p => ({ pageNum: p.pageNum, dataUrl: p.dataUrl })));
                setPdfFileName(file.name);
                setShowPdfPicker(true);
              }
              imported = true;
            }
          } catch { /* pdf.js failed */ }

          if (!imported && isEpsFile) {
            try {
              const fd = new FormData();
              fd.append("file", new Blob([arrayBuffer]), file.name);
              const { fetchWithTimeout } = await import("../canvas/canvasUtils");
              const resp = await fetchWithTimeout(apiUrl("/api/convert-eps"), { method: "POST", body: fd, timeoutMs: 90000 });
              if (resp.ok) {
                const result = await resp.json();
                if (result.dataUrl) {
                  addImageToCanvas(result.dataUrl, false, 0.9);
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
                    const url = offscreen.toDataURL("image/png");
                    releaseTempCanvas(offscreen);
                    addImageToCanvas(url, false, 0.9);
                    saveUploadHistory((prev) => [{ id: randomId(), dataUrl: url, name: file.name, date: Date.now() }, ...prev]);
                    imported = true;
                  } catch { /* render failed */ }
                }
              }
            } catch { /* api failed */ }
          }

          // TIFF preview fallback
          if (!imported && isEpsFile) {
            try {
              const data = new Uint8Array(arrayBuffer);
              const magic = (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0;
              if (magic === 0xC6D3D0C5) {
                const to = data[20] | (data[21] << 8) | (data[22] << 16) | (data[23] << 24);
                const tl = data[24] | (data[25] << 8) | (data[26] << 16) | (data[27] << 24);
                if (to > 0 && tl > 0 && to + tl <= data.length) {
                  const UTIF = await loadUtif();
                  const ifds = UTIF.decode(data.slice(to, to + tl).buffer);
                  if (ifds.length > 0) {
                    UTIF.decodeImage(data.slice(to, to + tl).buffer, ifds[0]);
                    const rgba = UTIF.toRGBA8(ifds[0]);
                    const w = ifds[0].width, h = ifds[0].height;
                    if (w > 0 && h > 0 && w <= 10000 && h <= 10000) {
                      const c = getTempCanvas(w, h);
                      const ctx = c.getContext("2d")!;
                      const id = ctx.createImageData(w, h);
                      id.data.set(new Uint8Array(rgba));
                      ctx.putImageData(id, 0, 0);
                      const url = c.toDataURL("image/png");
                      releaseTempCanvas(c);
                      addImageToCanvas(url, false, 0.9);
                      saveUploadHistory((prev) => [{ id: randomId(), dataUrl: url, name: file.name, date: Date.now() }, ...prev]);
                      imported = true;
                    }
                  }
                }
              }
            } catch { /* tiff failed */ }
          }

          // EPSI preview fallback
          if (!imported && isEpsFile) {
            try {
              const text = new TextDecoder("ascii").decode(new Uint8Array(arrayBuffer));
              const m = text.match(/%%BeginPreview:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)([\s\S]*?)%%EndPreview/);
              if (m) {
                const pw = parseInt(m[1]), ph = parseInt(m[2]), depth = parseInt(m[3]);
                if (pw > 0 && ph > 0 && pw <= 10000 && ph <= 10000) {
                  const hexStr = m[5].split("\n").filter(l => l.startsWith("%")).map(l => l.substring(1).trim()).join("");
                  const bytes: number[] = [];
                  for (let i = 0; i < hexStr.length; i += 2) bytes.push(parseInt(hexStr.substring(i, i + 2), 16));
                  const c = getTempCanvas(pw, ph);
                  const ctx = c.getContext("2d")!;
                  const id = ctx.createImageData(pw, ph);
                  if (depth === 1) {
                    const rb = Math.ceil(pw / 8);
                    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
                      const val = ((bytes[y * rb + Math.floor(x / 8)] >> (7 - (x % 8))) & 1) ? 0 : 255;
                      const pi = (y * pw + x) * 4;
                      id.data[pi] = val; id.data[pi + 1] = val; id.data[pi + 2] = val; id.data[pi + 3] = 255;
                    }
                  } else {
                    for (let i = 0; i < pw * ph && i < bytes.length; i++) {
                      const pi = i * 4;
                      id.data[pi] = bytes[i]; id.data[pi + 1] = bytes[i]; id.data[pi + 2] = bytes[i]; id.data[pi + 3] = 255;
                    }
                  }
                  ctx.putImageData(id, 0, 0);
                  const url = c.toDataURL("image/png");
                  releaseTempCanvas(c);
                  addImageToCanvas(url, false, 0.9);
                  saveUploadHistory((prev) => [{ id: randomId(), dataUrl: url, name: file.name, date: Date.now() }, ...prev]);
                  imported = true;
                }
              }
            } catch { /* epsi failed */ }
          }

          if (!imported) {
            const ext = file.name.split(".").pop()?.toUpperCase() || "PDF";
            toast(isEpsFile
              ? "Impossible d'importer ce fichier EPS."
              : `Erreur import ${ext}.`, "error");
          }
        }

        // ── Image files (SVG + raster) ──
        for (const file of imageFiles) {
          const fName = file.name.toLowerCase();
          if (file.type === "image/svg+xml" || fName.endsWith(".svg")) {
            try {
              const svgText = await file.text();
              const result = await fabric.loadSVGFromString(svgText);
              const validObjects = result.objects.filter(Boolean) as any[];
              if (!validObjects.length) { toast("SVG vide ou non supporté", "error"); continue; }
              const group = fabric.util.groupSVGElements(validObjects, result.options);
              const scale = Math.min(canvasWidth * 0.7 / (group.width || 1), canvasHeight * 0.7 / (group.height || 1));
              group.set({ scaleX: scale, scaleY: scale, left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2, originX: "center", originY: "center" });
              canvas.add(group);
              canvas.setActiveObject(group);
              canvas.requestRenderAll();
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
            } catch { toast("Erreur lors de l'import du SVG.", "error"); }
            continue;
          }
          // Raster
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string;
              saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
              const imgEl = document.createElement("img");
              imgEl.crossOrigin = "anonymous";
              imgEl.onload = () => {
                const img = new fabric.FabricImage(imgEl, { objectCaching: false });
                const scale = Math.min(canvasWidth * 0.7 / img.width!, canvasHeight * 0.7 / img.height!);
                img.set({ scaleX: scale, scaleY: scale, left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2, originX: "center", originY: "center" });
                canvas.add(img);
                canvas.setActiveObject(img);
                canvas.requestRenderAll();
                resolve();
              };
              imgEl.onerror = () => {
                toast(`Erreur lors du chargement de ${file.name}.`, "error");
                resolve();
              };
              imgEl.src = dataUrl;
            };
            reader.onerror = () => {
              toast(`Erreur lors de la lecture de ${file.name}.`, "error");
              resolve();
            };
            reader.readAsDataURL(file);
          });
        }

        // ── Special formats (PSD, TIFF, HEIC) ──
        for (const file of specialFiles) {
          const n = file.name.toLowerCase();
          try {
            let dataUrl = "";
            if (n.endsWith(".psd")) {
              const Psd = await loadPsd();
              const ab = await file.arrayBuffer();
              const psd = Psd.parse(ab);
              if (psd.width > 10000 || psd.height > 10000) { toast("PSD trop volumineux", "error"); continue; }
              const composite = await psd.composite();
              const c = getTempCanvas(psd.width, psd.height);
              const ctx = c.getContext("2d")!;
              const id = ctx.createImageData(psd.width, psd.height);
              id.data.set(composite);
              ctx.putImageData(id, 0, 0);
              dataUrl = c.toDataURL("image/png");
              releaseTempCanvas(c);
            } else if (n.endsWith(".tiff") || n.endsWith(".tif")) {
              const UTIF = await loadUtif();
              const ab = await file.arrayBuffer();
              const ifds = UTIF.decode(ab);
              if (!ifds[0] || ifds[0].width > 10000) { toast("TIFF trop volumineux", "error"); continue; }
              UTIF.decodeImage(ab, ifds[0]);
              const rgba = UTIF.toRGBA8(ifds[0]);
              const c = getTempCanvas(ifds[0].width, ifds[0].height);
              const ctx = c.getContext("2d")!;
              const id = ctx.createImageData(ifds[0].width, ifds[0].height);
              id.data.set(new Uint8ClampedArray(rgba));
              ctx.putImageData(id, 0, 0);
              dataUrl = c.toDataURL("image/png");
              releaseTempCanvas(c);
            } else if (n.endsWith(".heic") || n.endsWith(".heif")) {
              const heic2any = await loadHeic2any();
              const blob = await heic2any({ blob: file, toType: "image/png" }) as Blob;
              dataUrl = await new Promise<string>((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = (ev) => resolve(ev.target?.result as string);
                fr.onerror = () => reject(new Error("HEIC read failed"));
                fr.readAsDataURL(blob);
              });
            }
            if (dataUrl) {
              addImageToCanvas(dataUrl, false);
              saveUploadHistory((prev) => [{ id: randomId(), dataUrl, name: file.name, date: Date.now() }, ...prev]);
            }
          } catch { toast(`Erreur lors de l'import de ${file.name}.`, "error"); }
        }
      } finally {
        setIsUploading(false);
      }
    },
    [fabricRef, canvasWidth, canvasHeight, BLEED_PX, addImageToCanvas, saveUploadHistory, setPdfPages, setPdfFileName, setShowPdfPicker]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCountRef.current++;
    if (dragCountRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Clamp to 0 — some browsers fire dragleave without a matching dragenter
    // when crossing iframes/SVG children, which would otherwise leave the
    // counter negative and silently disable the drop overlay.
    dragCountRef.current = Math.max(0, dragCountRef.current - 1);
    if (dragCountRef.current === 0) setIsDragging(false);
  }, []);

  return { handleDrop, handleDragOver, handleDragEnter, handleDragLeave, isDragging, isUploading, setIsUploading };
}
