"use client";

import { OPEN_EDIT_HISTORY } from "./lab-edit-log";

/**
 * "Edit history 14" — opens the log at the foot of the page and jumps to it.
 *
 * A custom event rather than shared state, because the two live in different
 * columns of the page and hoisting the log's open/loaded/paginated state up to
 * the layout just to pass it back down would make the page a client component
 * for one link's sake.
 *
 * It stays an anchor, so the href still works with JavaScript off and
 * middle-click still does the sensible thing; the handler only adds the opening.
 */
export function EditHistoryLink({ count }: { count: number }) {
  return (
    <a
      href="#edit-history"
      onClick={() => window.dispatchEvent(new Event(OPEN_EDIT_HISTORY))}
      className="font-sans text-xs underline underline-offset-2 hover:no-underline"
    >
      Edit history {count}
    </a>
  );
}
