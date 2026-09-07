import { cn } from "@/lib/utils";

/**
 * The building blocks every block on a lab page is made of.
 *
 * Two ideas live here rather than being repeated in nine components. The first
 * is the exhibition-tag heading: small, spaced capitals in the sans face, on a
 * hairline rule, which is what carries the editorial feel without borders or
 * shadows. The second is `NotEntered`, and it matters more than it looks.
 */

export function LabSection({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  /** Right-aligned on the heading rule — a count, a link. */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-border pt-5", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-sans text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {title}
        </h2>
        {aside ? (
          <div className="font-sans text-[11px] text-muted-foreground">
            {aside}
          </div>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A field nobody has filled in yet, stated rather than omitted.
 *
 * This is a deliberate inversion of the usual rule that empty sections should
 * disappear. Every lab page is a contribution prompt: an absent hours table
 * that renders as nothing tells a reader the lab has no hours, while an
 * explicit "not entered yet" tells them the truth — that the answer is missing
 * and they could supply it. Dashed and greyed so it never reads as content.
 */
export function NotEntered({
  children = "Not entered yet",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border border-dashed border-border px-3 py-2 font-sans text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A flat, square chip — the only decorative shape the design direction allows. */
export function Chip({
  children,
  className,
  muted = false,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-2 py-1 font-sans text-xs",
        muted
          ? "border-border text-muted-foreground"
          : "border-foreground text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
