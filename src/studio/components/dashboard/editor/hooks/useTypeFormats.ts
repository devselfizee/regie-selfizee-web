"use client";

import { useEffect, useState } from "react";
import { apiUrl, apiFetchOptions } from "@/studio/lib/api";
import { FORMATS as LOCAL_FORMATS, type Format } from "@/studio/lib/gabarits";
import { filtrerFormats } from "@/studio/lib/restrictionStudio";

/**
 * Fetch the Format catalogue for a given TypeCreation slug.
 *
 * Fallbacks to the locally hardcoded FORMATS (cadres) when:
 *  - no slug is given (legacy flow)
 *  - slug === "cadres" and the fetch fails (offline dev)
 */
export function useTypeFormats(typeSlug?: string) {
  const [formats, setFormats] = useState<Format[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const slug = typeSlug || "cadres";
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/gabarits/formats?typeSlug=${slug}`), apiFetchOptions);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fmts: Format[] = (data.formats || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          poses: f.poses ?? "",
          aspectRatio: f.aspectRatio,
          widthPx: f.widthPx,
          heightPx: f.heightPx,
          orientation: f.orientation === "portrait" ? "portrait" : "landscape",
          formatBoothId: f.formatBoothId ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          gabarits: (f.gabarits || []).map((g: any) => ({
            id: g.id,
            name: g.name,
            photoZones: Array.isArray(g.photoZones) ? g.photoZones : [],
            textZones: Array.isArray(g.textZones) ? g.textZones : [],
          })),
        }));
        setFormats(filtrerFormats(fmts));
      } catch {
        if (cancelled) return;
        setFormats(slug === "cadres" ? filtrerFormats(LOCAL_FORMATS) : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [typeSlug]);

  return { formats, loading };
}
