import { cn } from "@/lib/utils";

/**
 * The two things every block on the lab page is built from.
 *
 * The prototype has no ruled, bordered sections: it separates blocks with white
 * space and labels each one with a small tracked-out eyebrow. That is the whole
 * visual grammar of the page, so it lives here rather than being retyped as a
 * utility string in nine components.
 */

export function SectionLabel({
  children,
  aside,
  className,
}: {
  children: React.ReactNode;
  /** Right-aligned on the same baseline — a count, a collapse toggle. */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4",
        aside ? "mb-2" : "mb-2.5",
        className,
      )}
    >
      <h2 className="font-sans text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {children}
      </h2>
      {aside}
    </div>
  );
}

/**
 * A field nobody has filled in, stated rather than omitted.
 *
 * A deliberate inversion of the usual rule that empty sections should
 * disappear. Every lab page is a contribution prompt: an absent hours table
 * reads as a lab with no hours, while "not entered yet" reads as a question
 * somebody could answer. The prototype makes the same move — its unticked
 * services and its "Not yet added — + Add" contact line are both this idea.
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
        "font-sans text-xs text-muted-foreground italic",
        className,
      )}
      data-filled="false"
    >
      {children}
    </p>
  );
}

/** The small print under a block — what a number does and does not mean. */
export function SectionNote({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-sans text-[11px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
