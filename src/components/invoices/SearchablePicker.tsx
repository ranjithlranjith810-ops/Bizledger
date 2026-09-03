"use client";

import React, { useRef, useState, useEffect } from "react";
import { Search, Check, ChevronDown } from "lucide-react";

export interface SearchablePickerProps<T> {
  items: T[];
  value: string;
  onSelect: (id: string) => void;
  getLabel: (item: T) => string;
  getSub?: (item: T) => string;
  searchText: (item: T) => string;
  placeholder: string;
  emptyText: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  buttonClassName?: string;
  panelClassName?: string;
}

export function SearchablePicker<T extends { id: string }>({
  items,
  value,
  onSelect,
  getLabel,
  getSub,
  searchText,
  placeholder,
  emptyText,
  emptyActionLabel,
  onEmptyAction,
  buttonClassName = "",
  panelClassName = "",
}: SearchablePickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selected = items.find((it) => it.id === value);

  const filtered = items.filter((it) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return searchText(it).toLowerCase().includes(q);
  });

  const toggle = () => {
    setOpen((o) => {
      if (!o) setQuery("");
      return !o;
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`w-full flex items-center justify-between gap-2 bg-white border border-[#eceef0] hover:border-[#93000b] py-2 px-3 rounded-lg text-xs font-medium text-left transition-colors ${buttonClassName}`}
      >
        <span className={selected ? "text-gray-900" : "text-gray-400"}>
          {selected ? getLabel(selected) : placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 w-full min-w-64 rounded-xl border border-[#eceef0] bg-white shadow-2xl overflow-hidden ${panelClassName}`}
        >
          <div className="relative border-b border-[#eceef0] bg-[#f7f9fb]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-2.5 text-xs bg-transparent outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-xs text-gray-500">{emptyText}</p>
                {emptyActionLabel && onEmptyAction && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onEmptyAction();
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#93000b] hover:bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    {emptyActionLabel}
                  </button>
                )}
              </div>
            ) : (
              filtered.map((it) => {
                const isSel = it.id === value;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      onSelect(it.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-start justify-between gap-2 px-3 py-2 text-left hover:bg-[#f7f9fb] transition-colors ${
                      isSel ? "bg-[#fef2f2]" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-xs ${
                          isSel ? "font-bold text-[#93000b]" : "font-semibold text-gray-900"
                        }`}
                      >
                        {getLabel(it)}
                      </span>
                      {getSub && (
                        <span className="block truncate text-[11px] text-gray-400 mt-0.5">
                          {getSub(it)}
                        </span>
                      )}
                    </span>
                    {isSel && <Check className="w-4 h-4 text-[#93000b] shrink-0 mt-0.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
