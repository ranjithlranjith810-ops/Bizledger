"use client";

type ScopeListener = () => void;
const scopeListeners = new Set<ScopeListener>();

export function subscribeBusinessScope(fn: ScopeListener): () => void {
  scopeListeners.add(fn);
  return () => {
    scopeListeners.delete(fn);
  };
}

export function notifyBusinessScopeChanged(): void {
  scopeListeners.forEach((l) => l());
}