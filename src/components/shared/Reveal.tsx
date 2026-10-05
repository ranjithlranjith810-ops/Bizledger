"use client";

import React, { useEffect, useRef } from "react";

interface RevealProps {
  className?: string;
  /** Optional stagger, in ms, applied to the transition. */
  delay?: number;
  children: React.ReactNode;
}

/**
 * Reveals its children once, the first time they scroll into view.
 *
 * Used only for section HEADERS. That is deliberate:
 *  - The rest of every section (copy, cards, steps, CTAs) is rendered in its
 *    final state and is never hidden behind motion, so a failed observer, a
 *    slow connection or a partial JS error can cost a visitor at most a plain
 *    heading — never content.
 *  - `prefers-reduced-motion: reduce` forces the element visible in CSS
 *    (globals.css), and this component also marks it revealed immediately, so
 *    reduced-motion visitors never depend on JS to see the text.
 *  - `LandingView` renders a <noscript> rule that does the same for visitors
 *    with JavaScript disabled.
 */
export function Reveal({ className = "", delay = 0, children }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Reduced motion, or no IntersectionObserver support: show it now.
    if (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      node.dataset.revealed = "true";
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          node.dataset.revealed = "true";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-revealed="false"
      className={`bl-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
