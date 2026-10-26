"use client";

import { trimToOpaqueBounds, getTrimmedPosition, replaceInGroupEditing } from "../canvas/canvasUtils";

export function PostSelectionPopup(props: any) {
  const {
    selectedObj,
    setSelectedObj,
    cropping,
    clipDialogPos,
    setClipDialogPos,
    clipFeatherValue,
    setClipFeatherValue,
    clipFeatherRef,
    clipDialogDragRef,
    containerRef,
    fabricRef,
    forceRender,
  } = props;

  if (!(selectedObj?.clipPath?._isLassoClip && selectedObj?.type === "image" && !cropping)) {
    return null;
  }

  return (
    <div
      className="absolute z-30 pointer-events-auto animate-[fadeSlideIn_0.15s_ease-out]"
      style={clipDialogPos
        ? { left: clipDialogPos.x, top: clipDialogPos.y }
        : { right: 24, top: 24 }
      }
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[340px]">
        {/* Drag handle */}
        <div
          className="flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing rounded-t-2xl hover:bg-gray-50 transition-colors"
          onMouseDown={(e) => {
            const rect = (e.currentTarget.parentElement!.parentElement! as HTMLElement).getBoundingClientRect();
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!containerRect) return;
            const origX = clipDialogPos?.x ?? (rect.left - containerRect.left);
            const origY = clipDialogPos?.y ?? (rect.top - containerRect.top);
            clipDialogDragRef.current = { startX: e.clientX, startY: e.clientY, origX, origY };
            const onMove = (ev: MouseEvent) => {
              if (!clipDialogDragRef.current) return;
              setClipDialogPos({
                x: clipDialogDragRef.current.origX + (ev.clientX - clipDialogDragRef.current.startX),
                y: clipDialogDragRef.current.origY + (ev.clientY - clipDialogDragRef.current.startY),
              });
            };
            const onUp = () => { clipDialogDragRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        >
          <div className="w-8 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="px-4 pb-4">
        <p className="text-sm font-bold text-gray-800 mb-1">Que souhaitez-vous faire ?</p>
        <p className="text-[11px] text-gray-400 mb-3">Votre sélection est prête. Choisissez une action :</p>
        {/* Feather slider */}
        <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
          <span className="text-[10px] text-gray-500 font-medium flex-shrink-0">Adoucir les bords</span>
          <input type="range" min={0} max={20} value={clipFeatherValue}
            onChange={(e) => { const v = parseInt(e.target.value); clipFeatherRef.current = v; setClipFeatherValue(v); }}
            className="flex-1 h-1.5 accent-purple-500"
          />
          <span className="text-[10px] text-gray-400 w-5 tabular-nums text-right">{clipFeatherValue}px</span>
        </div>
        <div className="space-y-2">
          {/* Garder la sélection (keep only selected area) */}
          <button
            onClick={async () => {
              const canvas = fabricRef.current;
              if (!canvas || !selectedObj || selectedObj.type !== "image") return;
              const imgEl = selectedObj.getElement(); if (!imgEl) return;
              const w = imgEl.naturalWidth || imgEl.width; const h = imgEl.naturalHeight || imgEl.height;
              const clip = selectedObj.clipPath; if (!clip?.path) return;
              const buildP = () => { const p = new Path2D(); for (const s of clip.path) { if(s[0]==="M")p.moveTo(s[1]+w/2,s[2]+h/2);else if(s[0]==="L")p.lineTo(s[1]+w/2,s[2]+h/2);else if(s[0]==="C")p.bezierCurveTo(s[1]+w/2,s[2]+h/2,s[3]+w/2,s[4]+h/2,s[5]+w/2,s[6]+h/2);else if(s[0]==="Q")p.quadraticCurveTo(s[1]+w/2,s[2]+h/2,s[3]+w/2,s[4]+h/2);else if(s[0]==="Z"||s[0]==="z")p.closePath(); } return p; };
              const mc = document.createElement("canvas"); mc.width=w; mc.height=h;
              const mx = mc.getContext("2d")!; if(clipFeatherRef.current>0) mx.filter=`blur(${clipFeatherRef.current}px)`; mx.fillStyle="white"; mx.fill(buildP());
              const oc = document.createElement("canvas"); oc.width=w; oc.height=h;
              const ox = oc.getContext("2d")!; ox.drawImage(imgEl,0,0); ox.globalCompositeOperation="destination-in"; ox.drawImage(mc,0,0);
              const fabric = await import("fabric");
              const maskedDataUrl = oc.toDataURL("image/png");
              // Memory leak fix: release temp canvases after compositing
              mc.width = 0; mc.height = 0; oc.width = 0; oc.height = 0;
              // Trim to opaque bounds so bounding box fits the visible content
              const trimResult = await trimToOpaqueBounds(maskedDataUrl);
              const finalUrl = trimResult ? trimResult.dataUrl : maskedDataUrl;
              const ni = await fabric.FabricImage.fromURL(finalUrl);
              if (trimResult) {
                const sx = selectedObj.scaleX || 1, sy = selectedObj.scaleY || 1;
                const tP = getTrimmedPosition(selectedObj, trimResult.dx, trimResult.dy, sx, sy);
                ni.set({ left: tP.left, top: tP.top, scaleX: sx, scaleY: sy, angle: selectedObj.angle, flipX: selectedObj.flipX, flipY: selectedObj.flipY, originX: "left", originY: "top", opacity: selectedObj.opacity });
              } else {
                ni.set({ left:selectedObj.left, top:selectedObj.top, scaleX:selectedObj.scaleX, scaleY:selectedObj.scaleY, angle:selectedObj.angle, flipX:selectedObj.flipX, flipY:selectedObj.flipY, originX:selectedObj.originX, originY:selectedObj.originY, opacity:selectedObj.opacity });
              }
              canvas.remove(selectedObj); canvas.add(ni); replaceInGroupEditing(selectedObj, ni); canvas.setActiveObject(ni); canvas.requestRenderAll(); setSelectedObj(ni);
              setClipDialogPos(null); setClipFeatherValue(0); clipFeatherRef.current = 0;
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <p className="text-sm font-bold text-purple-700">Garder la sélection</p>
              <p className="text-[10px] text-purple-400">Supprime tout ce qui est en dehors</p>
            </div>
          </button>
          {/* Supprimer la sélection (remove selected area, keep rest) */}
          <button
            onClick={async () => {
              const canvas = fabricRef.current;
              if (!canvas || !selectedObj || selectedObj.type !== "image") return;
              const imgEl = selectedObj.getElement(); if (!imgEl) return;
              const w = imgEl.naturalWidth || imgEl.width; const h = imgEl.naturalHeight || imgEl.height;
              const clip = selectedObj.clipPath; if (!clip?.path) return;
              const buildP = () => { const p = new Path2D(); for (const s of clip.path) { if(s[0]==="M")p.moveTo(s[1]+w/2,s[2]+h/2);else if(s[0]==="L")p.lineTo(s[1]+w/2,s[2]+h/2);else if(s[0]==="C")p.bezierCurveTo(s[1]+w/2,s[2]+h/2,s[3]+w/2,s[4]+h/2,s[5]+w/2,s[6]+h/2);else if(s[0]==="Q")p.quadraticCurveTo(s[1]+w/2,s[2]+h/2,s[3]+w/2,s[4]+h/2);else if(s[0]==="Z"||s[0]==="z")p.closePath(); } return p; };
              // INVERSE: erase the selected area, keep the rest
              const mc = document.createElement("canvas"); mc.width=w; mc.height=h;
              const mx = mc.getContext("2d")!;
              if(clipFeatherRef.current>0) mx.filter=`blur(${clipFeatherRef.current}px)`;
              mx.fillStyle="white"; mx.fill(buildP());
              const oc = document.createElement("canvas"); oc.width=w; oc.height=h;
              const ox = oc.getContext("2d")!; ox.drawImage(imgEl,0,0);
              ox.globalCompositeOperation="destination-out";
              ox.drawImage(mc,0,0);
              const fabric = await import("fabric");
              const maskedDataUrl2 = oc.toDataURL("image/png");
              // Memory leak fix: release temp canvases after compositing
              mc.width = 0; mc.height = 0; oc.width = 0; oc.height = 0;
              const trimResult2 = await trimToOpaqueBounds(maskedDataUrl2);
              const finalUrl2 = trimResult2 ? trimResult2.dataUrl : maskedDataUrl2;
              const ni = await fabric.FabricImage.fromURL(finalUrl2);
              if (trimResult2) {
                const sx = selectedObj.scaleX || 1, sy = selectedObj.scaleY || 1;
                const tP2 = getTrimmedPosition(selectedObj, trimResult2.dx, trimResult2.dy, sx, sy);
                ni.set({ left: tP2.left, top: tP2.top, scaleX: sx, scaleY: sy, angle: selectedObj.angle, flipX: selectedObj.flipX, flipY: selectedObj.flipY, originX: "left", originY: "top", opacity: selectedObj.opacity });
              } else {
                ni.set({ left:selectedObj.left, top:selectedObj.top, scaleX:selectedObj.scaleX, scaleY:selectedObj.scaleY, angle:selectedObj.angle, flipX:selectedObj.flipX, flipY:selectedObj.flipY, originX:selectedObj.originX, originY:selectedObj.originY, opacity:selectedObj.opacity });
              }
              canvas.remove(selectedObj); canvas.add(ni); replaceInGroupEditing(selectedObj, ni); canvas.setActiveObject(ni); canvas.requestRenderAll(); setSelectedObj(ni);
              setClipDialogPos(null); setClipFeatherValue(0); clipFeatherRef.current = 0;
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 border border-gray-200 hover:border-red-200 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Supprimer la sélection</p>
              <p className="text-[10px] text-gray-400">Efface la zone sélectionnée de l&apos;image</p>
            </div>
          </button>
          {/* Copier la sélection */}
          <button
            onClick={async () => {
              const canvas = fabricRef.current;
              if (!canvas || !selectedObj || selectedObj.type !== "image") return;
              const imgEl = selectedObj.getElement(); if (!imgEl) return;
              const w = imgEl.naturalWidth || imgEl.width; const h = imgEl.naturalHeight || imgEl.height;
              const clip = selectedObj.clipPath; if (!clip?.path) return;
              const buildP = () => { const p = new Path2D(); for (const s of clip.path) { if(s[0]==="M")p.moveTo(s[1]+w/2,s[2]+h/2);else if(s[0]==="L")p.lineTo(s[1]+w/2,s[2]+h/2);else if(s[0]==="C")p.bezierCurveTo(s[1]+w/2,s[2]+h/2,s[3]+w/2,s[4]+h/2,s[5]+w/2,s[6]+h/2);else if(s[0]==="Q")p.quadraticCurveTo(s[1]+w/2,s[2]+h/2,s[3]+w/2,s[4]+h/2);else if(s[0]==="Z"||s[0]==="z")p.closePath(); } return p; };
              const mc = document.createElement("canvas"); mc.width=w; mc.height=h;
              const mx = mc.getContext("2d")!; if(clipFeatherRef.current>0) mx.filter=`blur(${clipFeatherRef.current}px)`; mx.fillStyle="white"; mx.fill(buildP());
              const oc = document.createElement("canvas"); oc.width=w; oc.height=h;
              const ox = oc.getContext("2d")!; ox.drawImage(imgEl,0,0); ox.globalCompositeOperation="destination-in"; ox.drawImage(mc,0,0);
              const fabric = await import("fabric");
              const copyDataUrl = oc.toDataURL("image/png");
              // Memory leak fix: release temp canvases after compositing
              mc.width = 0; mc.height = 0; oc.width = 0; oc.height = 0;
              const trimCopy = await trimToOpaqueBounds(copyDataUrl);
              const ex = await fabric.FabricImage.fromURL(trimCopy ? trimCopy.dataUrl : copyDataUrl);
              if (trimCopy) {
                const sx = selectedObj.scaleX || 1, sy = selectedObj.scaleY || 1;
                const tPC = getTrimmedPosition(selectedObj, trimCopy.dx, trimCopy.dy, sx, sy);
                ex.set({ left: tPC.left + 30, top: tPC.top + 30, scaleX: sx, scaleY: sy, originX: "left", originY: "top" });
              } else {
                ex.set({ left:(selectedObj.left||0)+30, top:(selectedObj.top||0)+30, scaleX:selectedObj.scaleX, scaleY:selectedObj.scaleY, originX:selectedObj.originX, originY:selectedObj.originY });
              }
              selectedObj.set({ clipPath: undefined }); selectedObj.dirty = true;
              canvas.add(ex); canvas.setActiveObject(ex); canvas.requestRenderAll(); setSelectedObj(ex);
              setClipDialogPos(null); setClipFeatherValue(0); clipFeatherRef.current = 0;
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Copier la sélection</p>
              <p className="text-[10px] text-gray-400">Duplique la zone comme nouvel objet</p>
            </div>
          </button>
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
          <button onClick={() => {
            // Remove clipPath from the selected image to cancel the selection
            if (selectedObj) { selectedObj.clipPath = undefined; selectedObj.dirty = true; selectedObj.set({ hasControls: true, hasBorders: true }); }
              setClipDialogPos(null); setClipFeatherValue(0); clipFeatherRef.current = 0;
            fabricRef.current?.requestRenderAll();
            forceRender((n: number) => n + 1);
          }} className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            Annuler la sélection
          </button>
          <span className="text-[10px] text-gray-300">Ctrl+Z pour annuler</span>
        </div>
        </div>
      </div>
    </div>
  );
}
