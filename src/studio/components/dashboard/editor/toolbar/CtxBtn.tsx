"use client";

import React from "react";

export function CtxBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      // Explicit aria-label — title is announced inconsistently across
      // screen readers, aria-label always wins.
      aria-label={title}
      type="button"
      className={`p-1.5 rounded-md transition-colors ${
        danger
          ? "text-red-500 hover:text-red-600 hover:bg-red-50"
          : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

export default CtxBtn;
