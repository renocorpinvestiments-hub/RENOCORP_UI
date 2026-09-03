/**
 * utils/idempotency.js — RENOCORP Idempotency Key Generator  v2.0
 * =================================================================
 * Generates stable idempotency keys for mutations.
 *
 * CRITICAL RULE: For withdrawal and payment flows, generate the key
 * ONCE before showing the confirm dialog, then reuse the SAME key
 * on retry. Never generate a new key on retry — that defeats the purpose.
 *
 * Usage:
 *   const key = useIdempotencyKey(); // stable for the lifetime of the component
 *   const key = newIdempotencyKey(); // one-off generation
 */

import { useRef } from "react";

/**
 * Generate a single idempotency key.
 * Format: idem-<timestamp_b36>-<random_b36>
 */
export function newIdempotencyKey() {
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * React hook — returns a stable idempotency key that persists
 * for the lifetime of the component instance.
 * Survives re-renders. Resets only when component unmounts and remounts.
 *
 * Usage:
 *   const idempKey = useIdempotencyKey();
 */
export function useIdempotencyKey() {
  const ref = useRef(null);
  if (!ref.current) ref.current = newIdempotencyKey();
  return ref.current;
}

/**
 * Hook that returns a key AND a reset function.
 * Call reset() after a successful submission to get a fresh key
 * for the next transaction.
 *
 * Usage:
 *   const [idempKey, resetKey] = useIdempotencyKeyWithReset();
 */
export function useIdempotencyKeyWithReset() {
  const ref = useRef(newIdempotencyKey());
  const reset = () => { ref.current = newIdempotencyKey(); };
  return [ref.current, reset];
}

export default newIdempotencyKey;
