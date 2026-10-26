"use client";
import React from "react";
import { useLoadingClick } from "../hooks/useLoadingClick";
import { ThumbSpinner } from "./ThumbSpinner";

export function PanelUpload({ onUploadClick, uploadHistory, onReAdd, onDelete }: {
  onUploadClick: () => void;
  uploadHistory: { id: string; dataUrl: string; name: string; date: number }[];
  onReAdd: (dataUrl: string) => void;
  onDelete: (id: string) => void;
}) {
  const { loadingKey, run } = useLoadingClick();
  return (
    <div className="space-y-4">
      <button
        onClick={onUploadClick}
        className="w-full py-6 border-2 border-dashed border-[#4f46e5]/40 rounded-xl bg-purple-50/60 text-[#4f46e5] hover:border-[#4f46e5] hover:bg-purple-50 transition-all flex flex-col items-center gap-2 group"
      >
        <div className="w-10 h-10 rounded-full bg-[#4f46e5] text-white flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="text-sm font-semibold">Importer une image</span>
        <span className="text-[11px] text-gray-400">PNG, JPG, SVG, PDF, PSD, AI, EPS, TIFF, HEIC</span>
      </button>

      {uploadHistory.length > 0 && (
        <div>
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider mb-2">Vos imports récents</p>
          <div className="grid grid-cols-3 gap-2">
            {uploadHistory.map((item) => {
              const key = `up-${item.id}`;
              const handleAdd = () => run(key, async () => onReAdd(item.dataUrl));
              return (
                <div key={item.id} className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-[#4f46e5] transition-colors cursor-pointer">
                  <img
                    src={item.dataUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onClick={handleAdd}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAdd(); }}
                      className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-700 hover:text-[#4f46e5] mr-1"
                      title="Ajouter au canvas"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                      className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-700 hover:text-red-500"
                      title="Supprimer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-[9px] truncate">{item.name}</p>
                  </div>
                  {loadingKey === key && <ThumbSpinner />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-gray-400 text-xs">
        Glissez pour positionner, tirez les coins pour redimensionner.
      </p>
    </div>
  );
}

export default React.memo(PanelUpload);
