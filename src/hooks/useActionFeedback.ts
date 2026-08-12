/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useState, useCallback, useRef } from "react";

export type FeedbackState = "idle" | "loading" | "success" | "error";

export interface ActionFeedback {
  state: FeedbackState;
  message: string;
  run: <T>(action: () => Promise<T>, successMsg?: string) => Promise<T | undefined>;
  reset: () => void;
}

/**
 * Shared hook for wrapping Convex mutations with consistent loading / success /
 * error feedback.  Replaces the per-page `setShowResult()` / `setError()` state.
 *
 * Usage:
 *   const fb = useActionFeedback();
 *   await fb.run(() => someConvexMutation(args), "Saved!");
 */
export function useActionFeedback(defaultSuccessMsg = "Done!"): ActionFeedback {
  const [state, setState] = useState<FeedbackState>("idle");
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async <T>(action: () => Promise<T>, successMsg?: string): Promise<T | undefined> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState("loading");
      setMessage("");
      try {
        const result = await action();
        setState("success");
        setMessage(successMsg ?? defaultSuccessMsg);
        // Auto-reset after 3 s so the UI doesn't stay in "success" forever
        timerRef.current = setTimeout(() => setState("idle"), 3000);
        return result;
      } catch (err: unknown) {
        setState("error");
        setMessage(err instanceof Error ? err.message : "Something went wrong.");
        return undefined;
      }
    },
    [defaultSuccessMsg],
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState("idle");
    setMessage("");
  }, []);

  return { state, message, run, reset };
}
