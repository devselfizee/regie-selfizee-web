"use client";

import {
  CURSOR_WAND,
  trimToOpaqueBounds,
  getTrimmedPosition,
  replaceInGroupEditing,
} from "..";

export function WandPopup(props: any) {
  const {
    wandPopup,
    setWandPopup,
    canvasWrapperRef,
    displayScaleRef,
    fabricRef,
    setWandActive,
    isRestoringRef,
    setSelectedObj,
  } = props;

  if (!wandPopup) return null;

  // Smart positioning: prefer right of click point, fallback to left.
  const POP_W = 228, POP_H = 150;
  const wrapRect = canvasWrapperRef.current?.getBoundingClientRect();
  const s = displayScaleRef.current;
  const imgBr = wandPopup.targetImg?.getBoundingRect?.();
  let popX: number, popY: number;
  if (wrapRect && imgBr) {
    const imgRight = wrapRect.left + (imgBr.left + imgBr.width) * s;
    const imgLeft = wrapRect.left + imgBr.left * s;
    const imgMidY = wrapRect.top + (imgBr.top + imgBr.height / 2) * s;
    popY = imgMidY - POP_H / 2;
    if (imgRight + 16 + POP_W <= window.innerWidth - 8) {
      popX = imgRight + 16;
    } else if (imgLeft - 16 - POP_W >= 8) {
      popX = imgLeft - 16 - POP_W;
    } else {
      popX = wandPopup.clickX + 32;
    }
  } else {
    popX = wandPopup.clickX + 32;
    popY = wandPopup.clickY - POP_H / 2;
  }
  if (popX + POP_W > window.innerWidth - 8) popX = window.innerWidth - 8 - POP_W;
  if (popY < 8) popY = 8;
  if (popY + POP_H > window.innerHeight - 8) popY = window.innerHeight - 8 - POP_H;
  if (popX < 8) popX = 8;

  const restoreOriginal = () => {
    if (wandPopup.origSrc && wandPopup.targetImg) {
      wandPopup.targetImg._restoringOriginal = true;
      wandPopup.targetImg.setSrc(wandPopup.origSrc).then(() => {
        wandPopup.targetImg.dirty = true;
        wandPopup.targetImg._restoringOriginal = false;
        fabricRef.current?.requestRenderAll();
      });
    }
  };

  const exitWandMode = () => {
    setWandActive(false);
    isRestoringRef.current = false;
    const c = fabricRef.current;
    if (c) {
      c.defaultCursor = "default";
      c.hoverCursor = "move";
      if ((c as any)._wandMouseDown) {
        c.off("mouse:down", (c as any)._wandMouseDown);
        delete (c as any)._wandMouseDown;
      }
      c.getObjects().forEach((o: any) => {
        if (o._origCursor !== undefined) { o.hoverCursor = o._origCursor; delete o._origCursor; }
        else if (o.hoverCursor === CURSOR_WAND) { o.hoverCursor = "move"; }
      });
      c.requestRenderAll();
    }
  };

  const dismissPopup = () => {
    restoreOriginal();
    setWandPopup(null);
    exitWandMode();
  };

  const makeTrimmedImage = async (dataUrl: string, srcObj: any, offset = 0) => {
    const fabricMod = await import("fabric");
    const trimmed = await trimToOpaqueBounds(dataUrl);
    const url = trimmed ? trimmed.dataUrl : dataUrl;
    const img = new Image(); img.src = url;
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
    const fImg = new fabricMod.FabricImage(img);
    if (trimmed) {
      const sx = srcObj.scaleX || 1, sy = srcObj.scaleY || 1;
      const tPos = getTrimmedPosition(srcObj, trimmed.dx * sx, trimmed.dy * sy, 1, 1);
      fImg.set({
        left: tPos.left + offset, top: tPos.top + offset,
        scaleX: sx, scaleY: sy,
        angle: srcObj.angle, flipX: srcObj.flipX, flipY: srcObj.flipY,
        originX: "left", originY: "top",
        opacity: srcObj.opacity,
      });
    } else {
      const srcBr = srcObj.getBoundingRect();
      fImg.set({
        left: srcBr.left + offset, top: srcBr.top + offset,
        scaleX: srcObj.scaleX || 1, scaleY: srcObj.scaleY || 1,
        angle: srcObj.angle, flipX: srcObj.flipX, flipY: srcObj.flipY,
        originX: "left", originY: "top",
        opacity: srcObj.opacity,
      });
    }
    return fImg;
  };

  const applyDelete = async () => {
    const canvas = fabricRef.current; if (!canvas) return;
    const { targetImg, modifiedDataUrl } = wandPopup;
    setWandPopup(null); exitWandMode();
    const fImg = await makeTrimmedImage(modifiedDataUrl, targetImg);
    canvas.remove(targetImg);
    canvas.add(fImg);
    replaceInGroupEditing(targetImg, fImg);
    canvas.setActiveObject(fImg);
    canvas.requestRenderAll();
    setSelectedObj(fImg);
    canvas.fire("object:modified", { target: fImg, _historyLabel: "Sélection supprimée" });
  };

  const applyCopy = async () => {
    const canvas = fabricRef.current; if (!canvas) return;
    exitWandMode();
    const { targetImg, extractedDataUrl, origSrc } = wandPopup;
    if (origSrc && targetImg) {
      await targetImg.setSrc(origSrc);
      targetImg.dirty = true;
    }
    setWandPopup(null);
    const fImg = await makeTrimmedImage(extractedDataUrl, targetImg, 30);
    canvas.add(fImg);
    canvas.setActiveObject(fImg);
    canvas.requestRenderAll();
    setSelectedObj(fImg);
    canvas.fire("object:modified", { target: fImg, _historyLabel: "Zone copiée" });
  };

  const applyExtract = async () => {
    const canvas = fabricRef.current; if (!canvas) return;
    const { targetImg, modifiedDataUrl, extractedDataUrl } = wandPopup;
    setWandPopup(null); exitWandMode();
    const [fMod, fExt] = await Promise.all([
      makeTrimmedImage(modifiedDataUrl, targetImg),
      makeTrimmedImage(extractedDataUrl, targetImg),
    ]);
    canvas.remove(targetImg);
    canvas.add(fMod);
    canvas.add(fExt);
    replaceInGroupEditing(targetImg, fMod);
    canvas.setActiveObject(fExt);
    canvas.requestRenderAll();
    setSelectedObj(fExt);
    canvas.fire("object:modified", { target: fMod, _historyLabel: "Zone extraite" });
  };

  return (
    <>
      {/* Backdrop — click outside to dismiss */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onClick={dismissPopup}
      />
      <div
        style={{ position: "fixed", left: popX, top: popY, zIndex: 9999, width: POP_W }}
        className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-[fadeSlideIn_0.15s_ease-out] pointer-events-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-gray-100">
          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span className="text-xs font-semibold text-gray-700 flex-1">Que faire de la sélection ?</span>
          <button
            onClick={dismissPopup}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Annuler"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Actions */}
        <div className="p-2 flex flex-col gap-1">
          <button
            onClick={() => void applyDelete()}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors w-full text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Supprimer</span>
            <span className="text-xs text-red-400 font-normal ml-auto">défaut</span>
          </button>
          <button
            onClick={() => void applyCopy()}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors w-full text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copier la zone
          </button>
          <button
            onClick={() => void applyExtract()}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors w-full text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Extraire
          </button>
          {/* Cancel */}
          <button
            onClick={dismissPopup}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors w-full text-left"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}
