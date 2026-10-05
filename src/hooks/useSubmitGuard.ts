"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Single-flight guard for an async submit / create / save action.
 *
 * WHY A REF AND NOT JUST STATE
 * React state cannot by itself prevent a double submission. Two clicks
 * dispatched in the same tick both read the same, not-yet-committed state
 * value and both proceed, because `setState` has not been applied yet. A ref
 * is written during the event handler, so the second activation observes the
 * first one immediately. The state is kept alongside it purely to drive the
 * visual loading state (disabled button + "Creating…" label).
 *
 * WHAT THIS IS *NOT*
 * This is UX protection only — it is NOT the security boundary. A request
 * that is replayed, sent from another tab, or crafted by hand never passes
 * through here. The authoritative protection is server-side: the entitlement
 * check and the create happen in one transaction, with the conversion /
 * already-exists guards re-checked under a row lock (see
 * `invoice-service.createInvoice` and `quotation-service.createQuotation`).
 *
 * USAGE
 *   const { isSubmitting, run } = useSubmitGuard();
 *
 *   const handleSubmit = async (e: React.FormEvent) => {
 *     e.preventDefault();
 *     await run(submitForm);
 *   };
 *
 *   <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
 *
 * The guard is released in a `finally`, so a rejected action never leaves the
 * control permanently disabled and the user can retry. No artificial delay is
 * introduced.
 */
export function useSubmitGuard(): {
  /** True while an action started through `run` is still in flight. */
  isSubmitting: boolean;
  /**
   * Runs `action` at most once at a time. Concurrent/duplicate calls while an
   * action is in flight are dropped and resolve to `undefined` immediately.
   */
  run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
} {
  const inFlight = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    // Synchronous claim — this is what actually blocks the duplicate click.
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      return await action();
    } finally {
      // Released on success AND on failure, so a failed save can be retried.
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { isSubmitting, run };
}
