"use client";

import { useState, useEffect, useCallback } from "react";
import ColorPickerPopover from "../toolbar/ColorPickerPopover";

/**
 * SVG Color Editor — inline color dots in toolbar.
 * Shows extracted colors as clickable circles that open native color pickers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SvgColorEditor({ canvas, selectedObj }: { canvas: any; selectedObj: any }) {
  const [colors, setColors] = useState<{ color: string; count: number; type: "fill" | "stroke" }[]>([]);

  const extractColors = useCallback(() => {
    if (!selectedObj) { setColors([]); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = selectedObj._objects || (selectedObj.type === "group" ? selectedObj.getObjects() : []);
    if (children.length === 0 && selectedObj.fill) {
      const fill = typeof selectedObj.fill === "string" ? selectedObj.fill : null;
      const stroke = typeof selectedObj.stroke === "string" ? selectedObj.stroke : null;
      const result: { color: string; count: number; type: "fill" | "stroke" }[] = [];
      if (fill && fill !== "transparent" && fill !== "none" && fill !== "") {
        result.push({ color: fill, count: 1, type: "fill" });
      }
      if (stroke && stroke !== "transparent" && stroke !== "none" && stroke !== "") {
        result.push({ color: stroke, count: 1, type: "stroke" });
      }
      setColors(result);
      return;
    }

    const fillMap = new Map<string, number>();
    const strokeMap = new Map<string, number>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function traverse(objs: any[]) {
      for (const obj of objs) {
        if (obj._objects) { traverse(obj._objects); continue; }
        const fill = typeof obj.fill === "string" ? obj.fill : null;
        const stroke = typeof obj.stroke === "string" ? obj.stroke : null;
        if (fill && fill !== "transparent" && fill !== "none" && fill !== "") {
          fillMap.set(fill.toLowerCase(), (fillMap.get(fill.toLowerCase()) || 0) + 1);
        }
        if (stroke && stroke !== "transparent" && stroke !== "none" && stroke !== "" && stroke !== fill) {
          strokeMap.set(stroke.toLowerCase(), (strokeMap.get(stroke.toLowerCase()) || 0) + 1);
        }
      }
    }

    traverse(children);

    const result: { color: string; count: number; type: "fill" | "stroke" }[] = [];
    // Limit to top 12 most-used fill colors + top 4 stroke colors to avoid overflow
    [...fillMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([color, count]) => result.push({ color, count, type: "fill" }));
    [...strokeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([color, count]) => result.push({ color, count, type: "stroke" }));

    setColors(result);
  }, [selectedObj]);

  useEffect(() => {
    extractColors();
  }, [extractColors]);

  const changeColor = useCallback((oldColor: string, newColor: string, type: "fill" | "stroke") => {
    if (!selectedObj || !canvas) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = selectedObj._objects || (selectedObj.type === "group" ? selectedObj.getObjects() : []);

    if (children.length === 0) {
      selectedObj.set(type, newColor);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function replaceInChildren(objs: any[]) {
        for (const obj of objs) {
          if (obj._objects) { replaceInChildren(obj._objects); continue; }
          const val = typeof obj[type] === "string" ? obj[type].toLowerCase() : null;
          if (val === oldColor.toLowerCase()) {
            obj.set(type, newColor);
            obj.dirty = true;
          }
        }
      }
      replaceInChildren(children);
    }

    selectedObj.dirty = true;
    canvas.renderAll();
    canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Couleur SVG modifiée" });

    setColors(prev => prev.map(c =>
      c.color.toLowerCase() === oldColor.toLowerCase() && c.type === type
        ? { ...c, color: newColor }
        : c
    ));
  }, [selectedObj, canvas]);

  if (colors.length === 0) return null;

  const isLight = (hex: string) => {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 200;
  };

  return (
    <div className="flex items-center gap-1.5 max-w-[50vw] overflow-x-auto py-1" style={{ overscrollBehavior: "contain", scrollbarWidth: "none" }}>
      {colors.map(({ color, type }, idx) => (
        <ColorPickerPopover
          key={`${type}-${idx}`}
          color={color}
          onChange={(newColor) => changeColor(color, newColor, type)}
          swatchClassName={`w-7 h-7 rounded-full cursor-pointer transition-shadow flex-shrink-0 hover:ring-2 hover:ring-[#4f46e5] hover:ring-offset-1 ${isLight(color) ? "border border-gray-300" : "border border-transparent"} ${type === "stroke" ? "ring-1 ring-inset ring-white/70" : ""}`}
        />
      ))}
    </div>
  );
}

export default SvgColorEditor;
