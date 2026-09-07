import type { ContactChannel, LabDetail } from "@/lib/queries/labs";

import { NotEntered } from "./lab-section";

/**
 * Contacts, and the quick actions derived from them.
 *
 * Typed, repeatable `{channel, value}` rows rather than three fixed fields
 * (PRD A, Decision Ledger #5), and the reason that shape was chosen is visible
 * here: the Call and LINE buttons appear only when the lab actually has a phone
 * number or a LINE id, instead of three buttons rendering regardless and two of
 * them going nowhere.
 */

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "Phone",
  line: "LINE",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  email: "Email",
};

type Contact = LabDetail["contacts"][number];

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * A contact value as something clickable, or null to render it as plain text.
 *
 * Conservative by design. `tel:` and `mailto:` are unambiguous, and a value
 * that is already a URL is used as it stands. The handle-to-URL guesses are
 * limited to the two conventions that genuinely are conventions — Instagram's
 * profile path and LINE's documented add-friend link — and anything else is
 * shown as text rather than sent to a URL somebody has to trust we invented
 * correctly.
 */
function contactHref(contact: Contact): string | null {
  const value = contact.value.trim();
  if (!value) return null;
  if (isUrl(value)) return value;

  switch (contact.channel) {
    case "phone":
      // Everything a person might type between digits — spaces, dashes,
      // parentheses — is noise to a dialler, but a leading + is not.
      return `tel:${value.replace(/[^\d+]/g, "")}`;
    case "email":
      return `mailto:${value}`;
    case "website":
      return `https://${value}`;
    case "instagram":
      return `https://instagram.com/${value.replace(/^@/, "")}`;
    case "line":
      // LINE's add-by-id link. Official accounts keep their leading @, so the
      // value goes in as stored; anything with whitespace is not an id and
      // falls through to plain text.
      return /\s/.test(value) ? null : `https://line.me/R/ti/p/~${value}`;
    case "facebook":
      return null;
  }
}

export function LabContacts({ contacts }: Pick<LabDetail, "contacts">) {
  if (contacts.length === 0) {
    return <NotEntered>No contact details yet.</NotEntered>;
  }

  return (
    <dl className="font-sans text-sm">
      {contacts.map((contact) => {
        const href = contactHref(contact);

        return (
          <div
            key={contact.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2"
          >
            <dt className="text-xs text-muted-foreground">
              {CHANNEL_LABELS[contact.channel]}
            </dt>
            <dd className="break-all">
              {href ? (
                <a
                  href={href}
                  className="underline underline-offset-2 hover:no-underline"
                  {...(isUrl(href)
                    ? { target: "_blank", rel: "noreferrer noopener" }
                    : {})}
                >
                  {contact.value}
                </a>
              ) : (
                contact.value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Directions, Call and LINE — the three things somebody does after deciding.
 *
 * Directions is always available because a pin is required to publish a lab at
 * all; the other two appear only if the channel exists.
 */
export function LabQuickActions({
  lat,
  lng,
  nameEn,
  contacts,
}: Pick<LabDetail, "lat" | "lng" | "nameEn" | "contacts">) {
  const phone = contacts.find((c) => c.channel === "phone");
  const line = contacts.find((c) => c.channel === "line");

  const actions: { label: string; href: string; external: boolean }[] = [
    {
      label: "Directions",
      // Google's documented cross-platform Maps URL: coordinates rather than
      // the name, because the pin is the thing we are confident about.
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      external: true,
    },
  ];

  const phoneHref = phone ? contactHref(phone) : null;
  if (phoneHref)
    actions.push({ label: "Call", href: phoneHref, external: false });

  const lineHref = line ? contactHref(line) : null;
  if (lineHref) actions.push({ label: "LINE", href: lineHref, external: true });

  return (
    <nav aria-label={`Contact ${nameEn}`} className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          {...(action.external
            ? { target: "_blank", rel: "noreferrer noopener" }
            : {})}
          className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
        >
          {action.label}
        </a>
      ))}
    </nav>
  );
}
