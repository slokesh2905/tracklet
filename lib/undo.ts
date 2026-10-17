import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** How long "Undo" stays available before the delete is actually sent. */
export const UNDO_WINDOW_MS = 6000;

type Options = {
  /** Toast text, e.g. "Stopped tracking". */
  message: string;
  /** The real delete. Runs only once the undo window closes without an undo. */
  commit: () => Promise<ActionResult>;
  /** Bring the item back on screen (undo was pressed, or the delete failed). */
  restore: () => void;
};

/**
 * Forgiving delete: the caller hides the item immediately, we offer Undo, and only send the
 * delete when the toast goes away. Easy to reverse beats asking "are you sure?" every time.
 */
export function deleteWithUndo({ message, commit, restore }: Options) {
  let settled = false;

  async function finish() {
    if (settled) return;
    settled = true;
    const result = await commit();
    if (!result.ok) {
      restore();
      toast.error(result.error);
    }
  }

  toast(message, {
    duration: UNDO_WINDOW_MS,
    action: {
      label: "Undo",
      onClick: () => {
        if (settled) return;
        settled = true;
        restore();
      },
    },
    // Pressing Undo also dismisses the toast; `settled` makes that a no-op.
    onDismiss: finish,
    onAutoClose: finish,
  });
}
