"use client";

/**
 * Small spinner overlay used by the panels' image thumbnails to signal that
 * the clicked image is being processed (fetched, decoded and added to the
 * canvas). Sits absolutely positioned on top of the thumbnail; the wrapping
 * element is expected to have `position: relative`.
 */
export function ThumbSpinner({ size = 20 }: { size?: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none rounded-[inherit] z-10">
      <div
        className="border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
