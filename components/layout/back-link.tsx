import Link from "next/link";

/**
 * The way back, one line above the page.
 *
 * Every screen that can be arrived at from another one says where it came from
 * and lets you go there. It is written as a link to a known place rather than as
 * `history.back()`: a contributor who lands on /labs/[id]/edit from a bookmark,
 * a shared URL or a redirect after sign-in has no history to go back through,
 * and a back button that does nothing is worse than none.
 *
 * Matches the breadcrumb bar the lab detail page already carries — same border,
 * same padding, same faint 12px sans — so the two read as one pattern rather
 * than two conventions.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-border px-5 py-2.5 font-sans text-xs text-muted-foreground"
    >
      <Link href={href} className="hover:underline">
        <span aria-hidden="true">← </span>
        {label}
      </Link>
    </nav>
  );
}
