"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { safeRandomUUID } from "@/studio/lib/uuid";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

let _addToast: ((message: string, type?: ToastType, duration?: number) => void) | null = null;

/** Call from anywhere to show a toast notification */
export function toast(message: string, type: ToastType = "info", duration = 4000) {
  if (_addToast) _addToast(message, type, duration);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = safeRandomUUID();
    setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]);
    const timer = setTimeout(() => removeToast(id), duration);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const iconMap: Record<ToastType, string> = {
    success: "M5 13l4 4L19 7",
    error: "M6 18L18 6M6 6l12 12",
    warning: "M12 9v2m0 4h.01M12 3l9.66 16.59A1 1 0 0120.16 22H3.84a1 1 0 01-.84-2.41L12 3z",
    info: "M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z",
  };
  const colorMap: Record<ToastType, string> = {
    success: "bg-emerald-50 border-emerald-300 text-emerald-800",
    error: "bg-red-50 border-red-300 text-red-800",
    warning: "bg-amber-50 border-amber-300 text-amber-800",
    info: "bg-blue-50 border-blue-300 text-blue-800",
  };
  const iconColorMap: Record<ToastType, string> = {
    success: "text-emerald-500",
    error: "text-red-500",
    warning: "text-amber-500",
    info: "text-blue-500",
  };

  return (
    <div className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-sm font-medium animate-[fadeSlideIn_0.2s_ease-out] ${colorMap[t.type]}`}
          style={{ maxWidth: 400 }}
        >
          <svg className={`w-[18px] h-[18px] flex-shrink-0 ${iconColorMap[t.type]}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconMap[t.type]} />
          </svg>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
