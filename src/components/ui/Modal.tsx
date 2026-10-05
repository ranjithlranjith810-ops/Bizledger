"use client";

import React, { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 10.2-C1 §17: focus management for modal dialogs.
  //  - On open: remember the element that had focus, then move focus into the
  //    dialog so the keyboard focus does not stay behind the backdrop.
  //  - While open: trap Tab inside the dialog (no focus escape closed).
  //  - On close: restore focus to the previously focused element so the user
  //    continues exactly where they left off.
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dlg = dialogRef.current;
    previouslyFocused.current =
      (document.activeElement as HTMLElement | null) ?? null;
    dlg.focus();

    const focusables = () =>
      Array.from(
        dlg.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
      );

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === dlg)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dlg.addEventListener("keydown", trap);
    return () => {
      dlg.removeEventListener("keydown", trap);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div
      id="modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="modal-container"
        tabIndex={-1}
        className={`w-full ${maxWidthStyles[maxWidth]} bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-on-surface">{title}</h3>
            {subtitle && <p className="text-xs text-outline mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-secondary hover:text-on-surface hover:bg-surface-container-low transition-colors"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(85vh-130px)] overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3 bg-surface-container-low border-t border-outline-variant/20 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};