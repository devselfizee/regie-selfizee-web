"use client";
import React from "react";
import { logStudioError } from "@/studio/lib/studioLog";

interface Props { children: React.ReactNode; fallback?: React.ReactNode; name?: string; }
interface State { hasError: boolean; error?: Error; }

export class ToolErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const name = this.props.name || "Tool";
    console.error(`[${name}] Error:`, error, info);
    logStudioError("tool_crash", error, {
      source: name,
      level: "error",
      details: { componentStack: info.componentStack?.slice(0, 2000) },
    });
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-500 bg-red-50 rounded-lg">
          <span>⚠️ Erreur outil</span>
          <button onClick={() => this.setState({ hasError: false })} className="underline">Réessayer</button>
        </div>
      );
    }
    return this.props.children;
  }
}
