import type { ReactNode } from "react";

/**
 * The design system's empty state, used as a whole-page notice.
 *
 * Transcribed from `docs/design-system/component-library.html` — `.empty` is a
 * dashed hairline frame, 36px/20px padding, centred, capped at 360px, with a
 * 44px dashed ring above a 16px title and 12px ash copy capped at 32ch. Those
 * are the spec's numbers rather than approximations of them.
 *
 * The ring is the one place in the product that is not a sharp rectangle. The
 * design system writes it as `border-radius:50%!important`, deliberately
 * overriding its own radius-0 rule, so `rounded-full` here is the spec being
 * followed rather than CLAUDE.md's "no rounded corners" being broken.
 *
 * Only the frame is shared. What a 404 offers (ways back in) and what a 500
 * offers (another attempt) are different enough that folding them into one
 * component with a mode flag would hide more than it saved.
 */
export function Notice({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // The header is exactly 4rem by contract — site-header.tsx states its
    // height rather than letting padding decide it, and /labs already does this
    // arithmetic — so a notice can fill precisely what is left.
    <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 py-16">
      <div className="flex max-w-[360px] flex-col items-center gap-2.5 border border-dashed border-border px-5 py-9 text-center">
        <div
          className="h-11 w-11 rounded-full border-[1.5px] border-dashed border-foreground"
          aria-hidden="true"
        />
        <h1 className="text-base">{title}</h1>
        <div className="max-w-[32ch] font-sans text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
        {actions ? (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </main>
  );
}
