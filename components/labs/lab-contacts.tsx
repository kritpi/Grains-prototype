import type { ContactChannel, LabDetail } from "@/lib/queries/labs";

import { SectionLabel } from "./lab-section";

/**
 * Contacts, and the quick actions derived from them.
 *
 * Typed, repeatable `{channel, value}` rows rather than three fixed fields (PRD
 * A, Decision Ledger #5), and the reason that shape was chosen is visible here:
 * the Call and LINE buttons appear only when the lab actually has a phone number
 * or a LINE id, instead of three buttons rendering regardless and two going
 * nowhere.
 *
 * The prototype prints each row as a prefix and a value — `☏ 02-381-4420`, `IG
 * @handle` — and renders them as plain text. They stay links here: the href
 * logic below is careful about what it is willing to guess, and a phone number
 * you cannot tap on a phone is a worse page for the sake of a flatter one.
 */

const CHANNEL_PREFIX: Record<ContactChannel, string> = {
  phone: "☏",
  line: "LINE",
  instagram: "IG",
  facebook: "FB",
  website: "↗",
  email: "✉",
};

type Contact = LabDetail["contacts"][number];

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * A contact value as something clickable, or null to render it as plain text.
 *
 * Conservative by design. `tel:` and `mailto:` are unambiguous, and a value that
 * is already a URL is used as it stands. The handle-to-URL guesses are limited to
 * the two conventions that genuinely are conventions — Instagram's profile path
 * and LINE's documented add-friend link — and anything else is shown as text
 * rather than sent to a URL somebody has to trust we invented correctly.
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
  return (
    <section>
      <SectionLabel>Contact</SectionLabel>

      {contacts.length === 0 ? (
        <p className="font-sans text-xs italic" data-filled="false">
          Not yet added
        </p>
      ) : (
        <ul className="font-sans text-xs leading-[1.9]">
          {contacts.map((contact) => {
            const href = contactHref(contact);
            return (
              <li key={contact.id} className="flex gap-2">
                <span
                  className="shrink-0 text-muted-foreground"
                  aria-hidden="true"
                >
                  {CHANNEL_PREFIX[contact.channel]}
                </span>
                <span className="sr-only">{contact.channel}:</span>
                <span className="break-all">
                  {href ? (
                    <a
                      href={href}
                      className="hover:underline"
                      {...(isUrl(href)
                        ? { target: "_blank", rel: "noreferrer noopener" }
                        : {})}
                    >
                      {contact.value}
                    </a>
                  ) : (
                    contact.value
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Directions, Call and LINE — the three things somebody does after deciding.
 *
 * Full-width and equal, as the prototype has them: this is the row the whole
 * page is arranged around, so it is sized like a decision rather than like a
 * link. Directions is always available because a pin is required to publish a
 * lab at all; the other two appear only if the channel exists.
 */
export function LabQuickActions({
  lat,
  lng,
  nameEn,
  contacts,
}: Pick<LabDetail, "lat" | "lng" | "nameEn" | "contacts">) {
  const phone = contacts.find((c) => c.channel === "phone");
  const line = contacts.find((c) => c.channel === "line");

  const actions: {
    label: string;
    href: string;
    external: boolean;
    primary?: boolean;
  }[] = [
    {
      label: "Directions",
      // Google's documented cross-platform Maps URL: coordinates rather than
      // the name, because the pin is the thing we are confident about.
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      external: true,
      primary: true,
    },
  ];

  const phoneHref = phone ? contactHref(phone) : null;
  if (phoneHref)
    actions.push({ label: "Call", href: phoneHref, external: false });

  const lineHref = line ? contactHref(line) : null;
  if (lineHref) actions.push({ label: "LINE", href: lineHref, external: true });

  return (
    <nav aria-label={`Contact ${nameEn}`} className="flex gap-2">
      {actions.map((action) => (
        <a
          key={action.label}
          href={action.href}
          {...(action.external
            ? { target: "_blank", rel: "noreferrer noopener" }
            : {})}
          className={
            action.primary
              ? "flex-1 border-[1.5px] border-foreground bg-foreground py-2.5 text-center font-sans text-xs font-bold text-background hover:bg-transparent hover:text-foreground"
              : "flex-1 border-[1.5px] border-foreground py-2.5 text-center font-sans text-xs font-bold hover:bg-foreground hover:text-background"
          }
        >
          {action.label}
        </a>
      ))}
    </nav>
  );
}
