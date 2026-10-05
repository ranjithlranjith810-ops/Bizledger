"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal/dialog behavior for screens that do not use the styled <Modal>
 * shell (which already implements the same rules):
 *
 *  - Escape closes the dialog
 *  - keyboard focus moves into the dialog while it is open
 *  - Tab is trapped inside the dialog (focus cannot escape through the backdrop)
 *  - on close, focus returns to the element that had focus before the dialog
 *    opened
 *
 * Attach the returned ref to the outermost dialog container and give that
 * container `tabIndex={-1}` and `role="dialog"` + `aria-modal="true"` so it is
 * focusable as the neutral starting position and exposed correctly to assistive
 * technology. The dialog root must also carry an accessible name, e.g. via
 * `aria-labelledby` pointing at its heading element.
 *
 * The dialog is expected to mount when it opens and unmount when it closes
 * (the pattern every modal in this app uses), so the before/after focus states
 * line up with mount/unmount.
 */
export function useModalBehavior(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);

  // Keep the latest close callback without re-running the mount effect (which
  // owns focus entry/restoration); ref writes happen outside of render.
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const previouslyFocused =
      (document.activeElement as HTMLElement | null) ?? null;

    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) => !node.hasAttribute("disabled")
      );

    // Move keyboard focus into the dialog so it does not stay behind the
    // backdrop (requires tabIndex={-1} on the container).
    el.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };

    el.addEventListener("keydown", trap);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("keydown", trap);
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}