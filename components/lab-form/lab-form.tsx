"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createLab, updateLab, type LabActionResult } from "@/app/labs/actions";
import { DAY_LABELS } from "@/lib/labs/hours";
import {
  CONTACT_CHANNELS,
  type ChemProcess,
  type ContactChannel,
  type FilmFormat,
} from "@/lib/labs/paths";
import type { FormCatalog } from "@/lib/queries/catalogs";
import type { LabDetail } from "@/lib/queries/labs";

import {
  blankWeek,
  CELL_KEYS,
  CHEM_PROCESSES,
  createGate,
  diffDraft,
  draftFromLab,
  draftToCreateInput,
  emptyDraft,
  type DraftDay,
  type LabDraft,
} from "./draft";
import { AtmospherePhotos } from "./atmosphere-photos";
import { PinPicker } from "./pin-picker";
import { StockPicker } from "./stock-picker";

const PROCESS_LABELS: Record<ChemProcess, string> = {
  c41: "C-41",
  ecn2: "ECN-2",
  bw: "B&W",
  e6: "E-6",
};

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  phone: "Phone",
  line: "LINE",
  instagram: "Instagram",
  facebook: "Facebook",
  website: "Website",
  email: "Email",
};

type LabFormProps = {
  catalog: FormCatalog;
  /** Absent in create mode. Present, and the diff's baseline, in edit mode. */
  lab?: LabDetail;
};

/**
 * One form, two modes (PRD A #7).
 *
 * Add Lab and Suggest Edit are the same fields in the same order, because they
 * are the same act: a contributor putting what they know into a listing. A
 * separate creation wizard would mean two flows to keep in step, and the second
 * one would drift.
 *
 * The two modes differ in exactly three places, all of them consequences rather
 * than choices: create asks for a name (an edit already has one), create gates
 * the save on name + pin + one process, and edit sends a diff where create sends
 * a document — `applyLabChanges` needs leaves, `insertLab` needs a lab.
 *
 * Every section mirrors its read-view component, which is the design system's
 * rule for this screen: filling the form should preview the page. So the pricing
 * grid is the pricing grid, the services are a checklist, the week is seven
 * rows, and an un-offered process keeps its slot rather than disappearing.
 */
export function LabForm({ catalog, lab }: LabFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LabActionResult | null>(null);
  const [note, setNote] = useState("");

  // The baseline is a draft rather than the lab row, so what is compared is two
  // objects of the same shape. Comparing "180" against 180 is a formatting
  // question, and answering it in two places is how a form starts reporting
  // changes nobody made.
  //
  // Held in state rather than a ref because the diff reads it during render,
  // and a ref read during render is a value React does not promise is stable.
  // It is initialised once and never set: that is what makes it a baseline.
  const [initial] = useState<LabDraft>(() =>
    lab ? draftFromLab(lab) : emptyDraft(),
  );
  const [draft, setDraft] = useState<LabDraft>(() =>
    lab ? draftFromLab(lab) : emptyDraft(),
  );

  const creating = lab === undefined;
  const gate = createGate(draft);
  const changes = useMemo(
    () => (creating ? [] : diffDraft(initial, draft)),
    [creating, initial, draft],
  );

  const update = (change: (next: LabDraft) => void) =>
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });

  function save() {
    setResult(null);
    startTransition(async () => {
      const outcome = creating
        ? await createLab(draftToCreateInput(draft), note)
        : await updateLab(lab!.id, lab!.version, changes, note);

      setResult(outcome);
      if (outcome.ok) router.push(`/labs/${outcome.id}`);
    });
  }

  const canSave = creating
    ? gate.ready && !pending
    : changes.length > 0 && !pending;

  return (
    <form
      className="grains-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) save();
      }}
    >
      <header>
        <div className="grains-form-eyebrow">
          {creating ? "Add a lab" : "Suggest an edit"}
        </div>
        <h1 className="grains-form-title">
          {draft.nameEn.trim() || "Untitled lab"}
        </h1>
        <p className="grains-form-lede">
          Every field goes live the moment you save it — no review queue. The
          change is attributed to you and reversible by anyone.
        </p>
      </header>

      {creating && (
        <div className="grains-form-grid">
          <Field label="LAB NAME · TH">
            <input
              className="grains-input"
              value={draft.nameTh}
              placeholder="ชื่อร้าน"
              onChange={(e) => update((d) => (d.nameTh = e.target.value))}
            />
          </Field>
          <Field label="LAB NAME · EN">
            <input
              className="grains-input"
              value={draft.nameEn}
              placeholder="Lab name"
              onChange={(e) => update((d) => (d.nameEn = e.target.value))}
            />
          </Field>
        </div>
      )}

      <section>
        <div className="grains-form-label">LOCATION · TAP TO DROP A PIN</div>
        <PinPicker
          value={draft.location}
          excludeLabId={lab?.id}
          onChange={(pin) => update((d) => (d.location = pin))}
        />
        <Field label="STREET / AREA · edit if the pin got it wrong">
          <input
            className="grains-input-cell"
            value={draft.street}
            placeholder="street, district"
            onChange={(e) => update((d) => (d.street = e.target.value))}
          />
        </Field>
        <Field label="LANDMARK · WHAT TO LOOK FOR">
          <input
            className="grains-input"
            value={draft.landmarkNote}
            placeholder="e.g. above the 7-Eleven, unmarked door"
            onChange={(e) => update((d) => (d.landmarkNote = e.target.value))}
          />
        </Field>
      </section>

      <section>
        <div className="grains-form-label">PROCESSES OFFERED</div>
        <div className="grains-chips">
          {CHEM_PROCESSES.map((process) => (
            <button
              key={process}
              type="button"
              className="grains-toggle"
              data-process={process}
              data-on={draft.processes[process] === true}
              onClick={() =>
                update((d) => (d.processes[process] = !d.processes[process]))
              }
            >
              {PROCESS_LABELS[process]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="grains-form-label">SCANNERS</div>
        <div className="grains-chips">
          {catalog.scanners.map((model) => (
            <button
              key={model}
              type="button"
              className="grains-toggle"
              data-on={draft.scanners[model] === true}
              onClick={() =>
                update((d) => (d.scanners[model] = !d.scanners[model]))
              }
            >
              {model}
            </button>
          ))}
        </div>
      </section>

      <PricingSection draft={draft} update={update} />

      <section>
        <div className="grains-form-label">SERVICES</div>
        {catalog.services.map((service) => {
          const state = draft.services[service.key] ?? { on: false, note: "" };
          return (
            <div key={service.key} className="grains-check-row">
              <button
                type="button"
                className="grains-check"
                data-svstate={state.on ? "yes" : "no"}
                onClick={() =>
                  update((d) => {
                    const current = d.services[service.key] ?? {
                      on: false,
                      note: "",
                    };
                    d.services[service.key] = { ...current, on: !current.on };
                  })
                }
              >
                <span className="grains-svbox">{state.on ? "✓" : ""}</span>
                <span>{service.labelEn}</span>
              </button>
              {state.on && (
                <input
                  className="grains-input-cell"
                  value={state.note}
                  placeholder="e.g. from ฿60"
                  onChange={(e) =>
                    update((d) => {
                      const current = d.services[service.key] ?? {
                        on: true,
                        note: "",
                      };
                      d.services[service.key] = {
                        ...current,
                        note: e.target.value,
                      };
                    })
                  }
                />
              )}
            </div>
          );
        })}
        <CustomRows
          rows={draft.customServices}
          placeholder="add a service not listed"
          onAdd={(label) =>
            update((d) =>
              d.customServices.push({
                id: crypto.randomUUID(),
                label,
                note: "",
              }),
            )
          }
          onRemove={(id) =>
            update(
              (d) =>
                (d.customServices = d.customServices.filter(
                  (r) => r.id !== id,
                )),
            )
          }
        />
        <p className="grains-note">
          Community-added services show on the listing but aren&apos;t a search
          filter.
        </p>
      </section>

      <InventorySection draft={draft} update={update} />

      <section>
        <div className="grains-form-label">DARKROOM SUPPLIES</div>
        <div className="grains-chips">
          {catalog.supplies.map((supply) => (
            <button
              key={supply.key}
              type="button"
              className="grains-toggle"
              data-on={draft.supplies[supply.key] === true}
              onClick={() =>
                update(
                  (d) => (d.supplies[supply.key] = !d.supplies[supply.key]),
                )
              }
            >
              {supply.labelEn}
            </button>
          ))}
        </div>
        <CustomRows
          rows={draft.customSupplies}
          placeholder="add a supply not listed"
          onAdd={(label) =>
            update((d) =>
              d.customSupplies.push({ id: crypto.randomUUID(), label }),
            )
          }
          onRemove={(id) =>
            update(
              (d) =>
                (d.customSupplies = d.customSupplies.filter(
                  (r) => r.id !== id,
                )),
            )
          }
        />
      </section>

      <ContactSection draft={draft} update={update} />
      <HoursSection draft={draft} update={update} />

      <AtmospherePhotos labId={lab?.id} count={lab?.photos.length ?? 0} />

      <Field label="NOTE FOR THE HISTORY LOG · OPTIONAL">
        <input
          className="grains-input-cell"
          value={note}
          placeholder="e.g. price board photographed 2 Sep"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <Problems result={result} />

      <div className="grains-actions">
        <button type="submit" className="grains-save" disabled={!canSave}>
          {pending
            ? "Saving…"
            : creating
              ? "Publish lab"
              : "Save — goes live now"}
        </button>
        {creating && !gate.ready && (
          <span className="grains-hours-closed">
            Still needs {gate.missing.join(", ")}.
          </span>
        )}
        {!creating && (
          <span className="grains-hours-closed">
            {changes.length === 0
              ? "Nothing changed yet."
              : `${changes.length} change${changes.length === 1 ? "" : "s"} to save.`}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

type UpdateFn = (change: (next: LabDraft) => void) => void;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grains-form-field">
      <span className="grains-form-label">{label}</span>
      {children}
    </label>
  );
}

/**
 * The pricing matrix, editable.
 *
 * PROCESS | 135 | 120 | TURNAROUND, exactly as the prototype and the read view
 * draw it — with the same deviation Track A recorded as P25, and for the same
 * reason. The prototype gives a process one turnaround input; the schema stores
 * turnaround per (process, format), because a 135 can come back next day while
 * 120 goes to a partner lab for a week. A single input would have to invent one
 * of those. So the column holds one small input per format, labelled, in the
 * prototype's column and at its width.
 *
 * Only offered processes get a row here, where the read view keeps a row for
 * every process. That is not an inconsistency: on the page an un-offered process
 * is an answer worth showing, and in the form it is a row you cannot fill —
 * the chips above are where a process is offered.
 */
function PricingSection({
  draft,
  update,
}: {
  draft: LabDraft;
  update: UpdateFn;
}) {
  const offered = CHEM_PROCESSES.filter((p) => draft.processes[p] === true);

  return (
    <section>
      <div className="grains-form-label">
        PRICING &amp; TURNAROUND · PER PROCESS
      </div>
      {offered.length === 0 ? (
        <p className="grains-hours-closed">
          Pick a process above to set its pricing.
        </p>
      ) : (
        <div className="grains-matrix">
          <div className="grains-matrix-head">
            <div className="grains-matrix-process">PROCESS</div>
            <div className="grains-matrix-cell">135</div>
            <div className="grains-matrix-cell">120</div>
            <div className="grains-matrix-turn">
              <span style={{ textAlign: "right" }}>TURNAROUND</span>
            </div>
          </div>
          {offered.map((process) => (
            <div key={process} className="grains-matrix-row">
              <div className="grains-matrix-process" data-process={process}>
                {PROCESS_LABELS[process]}
              </div>
              {(["135", "120"] as FilmFormat[]).map((format) => (
                <input
                  key={format}
                  className="grains-input-cell grains-matrix-cell"
                  value={draft.pricing[`${process}.${format}`]?.price ?? ""}
                  placeholder="฿ / roll"
                  aria-label={`${PROCESS_LABELS[process]} ${format} price`}
                  onChange={(e) =>
                    update((d) =>
                      setCell(d, process, format, "price", e.target.value),
                    )
                  }
                />
              ))}
              <div className="grains-matrix-turn">
                {(["135", "120"] as FilmFormat[]).map((format) => (
                  <label key={format}>
                    {format}
                    <input
                      className="grains-input-cell"
                      value={
                        draft.pricing[`${process}.${format}`]?.turnaround ?? ""
                      }
                      placeholder="2 or 2-4"
                      aria-label={`${PROCESS_LABELS[process]} ${format} turnaround in days`}
                      onChange={(e) =>
                        update((d) =>
                          setCell(
                            d,
                            process,
                            format,
                            "turnaround",
                            e.target.value,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function setCell(
  draft: LabDraft,
  process: ChemProcess,
  format: FilmFormat,
  field: "price" | "turnaround",
  value: string,
): void {
  const key = `${process}.${format}`;
  const cell = draft.pricing[key] ?? { price: "", turnaround: "" };
  draft.pricing[key] = { ...cell, [field]: value };
}

/**
 * Inventory.
 *
 * A lab cannot carry a film stock that is not a catalog entry (PRD A #3) — that
 * link is what makes reverse search from a stock's page possible at all. So the
 * picker searches the catalog and can add to it inline, rather than sending a
 * contributor to /films and back with their edit abandoned behind them.
 */
function InventorySection({
  draft,
  update,
}: {
  draft: LabDraft;
  update: UpdateFn;
}) {
  return (
    <section>
      <div className="grains-form-label">IN STORE · FILM STOCK</div>
      {draft.stock.length === 0 ? (
        <p className="grains-hours-closed">No film stock listed yet.</p>
      ) : (
        draft.stock.map((stock) => (
          <div key={stock.filmStockId} className="grains-check-row">
            <span style={{ font: "400 12.5px var(--font-sans)", width: 160 }}>
              {stock.name}
            </span>
            {(["135", "120"] as FilmFormat[]).map((format) => (
              <button
                key={format}
                type="button"
                className="grains-toggle"
                style={{ padding: "4px 9px", fontSize: 11 }}
                data-on={stock.formats.includes(format)}
                onClick={() =>
                  update((d) => {
                    const row = d.stock.find(
                      (s) => s.filmStockId === stock.filmStockId,
                    )!;
                    row.formats = row.formats.includes(format)
                      ? row.formats.filter((f) => f !== format)
                      : [...row.formats, format];
                  })
                }
              >
                {format}
              </button>
            ))}
            <button
              type="button"
              className="grains-row-remove"
              aria-label={`Remove ${stock.name}`}
              onClick={() =>
                update(
                  (d) =>
                    (d.stock = d.stock.filter(
                      (s) => s.filmStockId !== stock.filmStockId,
                    )),
                )
              }
            >
              ✕
            </button>
          </div>
        ))
      )}
      <StockPicker
        existingIds={draft.stock.map((s) => s.filmStockId)}
        onPick={({ filmStockId, name }) =>
          update((d) => {
            if (d.stock.some((s) => s.filmStockId === filmStockId)) return;
            // 135 by default, matching what a new catalog entry starts as; the
            // format chips beside the row are how a contributor says otherwise.
            d.stock.push({ filmStockId, name, formats: ["135"] });
          })
        }
      />
      <p className="grains-note">
        Must match a Film Stock catalog entry — reverse search from a
        stock&apos;s page depends on it.
      </p>
    </section>
  );
}

function ContactSection({
  draft,
  update,
}: {
  draft: LabDraft;
  update: UpdateFn;
}) {
  return (
    <section>
      <div className="grains-form-label">CONTACT</div>
      {draft.contacts.map((contact, index) => (
        <div key={contact.id} className="grains-check-row">
          <select
            className="grains-input-cell"
            style={{ width: 120 }}
            value={contact.channel}
            aria-label="Contact channel"
            onChange={(e) =>
              update(
                (d) =>
                  (d.contacts[index].channel = e.target
                    .value as ContactChannel),
              )
            }
          >
            {CONTACT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
          <input
            className="grains-input-cell"
            style={{ flex: 1, width: "auto" }}
            value={contact.value}
            placeholder="02 214 5500"
            aria-label="Contact value"
            onChange={(e) =>
              update((d) => (d.contacts[index].value = e.target.value))
            }
          />
          <button
            type="button"
            className="grains-row-remove"
            aria-label="Remove contact"
            onClick={() => update((d) => d.contacts.splice(index, 1))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="grains-secondary"
        style={{ alignSelf: "flex-start" }}
        onClick={() =>
          update((d) =>
            d.contacts.push({
              id: crypto.randomUUID(),
              channel: "phone",
              value: "",
            }),
          )
        }
      >
        + Add a channel
      </button>
    </section>
  );
}

/**
 * The week, seven rows, Sunday first — the order `extract(dow)` uses and the
 * order the read view lists them in.
 *
 * Editing any day materialises all seven, because `labs_hours_shape` allows a
 * schedule of nothing or of a full week and nothing in between. The diff knows
 * this and reports only the day that was touched.
 */
function HoursSection({
  draft,
  update,
}: {
  draft: LabDraft;
  update: UpdateFn;
}) {
  const week = draft.hours;

  return (
    <section>
      <div className="grains-form-label">OPENING HOURS</div>
      {week === null ? (
        <button
          type="button"
          className="grains-secondary"
          style={{ alignSelf: "flex-start" }}
          onClick={() => update((d) => (d.hours = blankWeek()))}
        >
          + Add opening hours
        </button>
      ) : (
        <>
          {week.map((day, index) => (
            <div key={index} className="grains-hours-row">
              <span className="grains-hours-day">{DAY_LABELS[index]}</span>
              <button
                type="button"
                className="grains-check"
                data-svstate={day.closed ? "no" : "yes"}
                onClick={() =>
                  update((d) => {
                    d.hours![index] = day.closed
                      ? { closed: false, open: "09:00", close: "18:00" }
                      : { closed: true };
                  })
                }
              >
                <span className="grains-svbox">{day.closed ? "" : "✓"}</span>
                <span>Open</span>
              </button>
              {!day.closed && (
                <>
                  <TimeInput
                    label={`${DAY_LABELS[index]} opens`}
                    value={day.open}
                    onChange={(value) =>
                      update((d) => setTime(d.hours![index], "open", value))
                    }
                  />
                  <TimeInput
                    label={`${DAY_LABELS[index]} closes`}
                    value={day.close}
                    onChange={(value) =>
                      update((d) => setTime(d.hours![index], "close", value))
                    }
                  />
                </>
              )}
            </div>
          ))}
          <p className="grains-note">
            Open/closed is computed from this schedule. A manual status override
            wins over it when set.
          </p>
        </>
      )}
    </section>
  );
}

function setTime(day: DraftDay, field: "open" | "close", value: string): void {
  if (day.closed) return;
  day[field] = value;
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="grains-input-cell"
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A contributor's own rows: added, listed, removed. Never a filter. */
function CustomRows({
  rows,
  placeholder,
  onAdd,
  onRemove,
}: {
  rows: { id: string; label: string }[];
  placeholder: string;
  onAdd: (label: string) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");

  const add = () => {
    const label = text.trim();
    if (label === "") return;
    onAdd(label);
    setText("");
  };

  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="grains-check-row">
          <span className="grains-check" data-svstate="yes">
            <span className="grains-svbox">✓</span>
            <span>{row.label}</span>
          </span>
          <button
            type="button"
            className="grains-row-remove"
            aria-label={`Remove ${row.label}`}
            onClick={() => onRemove(row.id)}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="grains-check-row">
        <input
          className="grains-input-cell"
          style={{ flex: 1, width: "auto" }}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter inside a text field would otherwise submit the whole form,
            // which on this screen means saving a half-filled lab.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="grains-secondary" onClick={add}>
          + Add
        </button>
      </div>
    </>
  );
}

/**
 * What the save came back with.
 *
 * A conflict is the interesting one: somebody else edited this lab while this
 * form was open, and the answer is not "try again" but "here is what moved".
 * The version is stale, so reloading is the only honest next step — anything
 * else would be this form quietly deciding whose edit wins.
 */
function Problems({ result }: { result: LabActionResult | null }) {
  if (result === null || result.ok) return null;

  if (result.reason === "conflict") {
    return (
      <div className="grains-problem">
        <strong>Somebody edited this lab while you had it open.</strong>
        <p style={{ margin: "6px 0 0" }}>
          It is now called “{result.current?.nameEn ?? "unknown"}” and is on
          version {result.current?.version ?? "?"}. Reload to see what changed —
          your text is still on this page until you do.
        </p>
      </div>
    );
  }

  if (result.reason === "cascade") {
    return (
      <div className="grains-problem">
        <strong>
          Removing that process would delete pricing this save does not mention.
        </strong>
        <ul>
          {result.missing.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (result.reason === "rejected") {
    return <div className="grains-problem">{result.message}</div>;
  }

  if (result.reason === "unchanged") {
    return (
      <div className="grains-problem">
        Nothing changed, so nothing was saved.
      </div>
    );
  }

  return (
    <div className="grains-problem">
      <strong>That could not be saved.</strong>
      <ul>
        {result.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}

export { CELL_KEYS };
