"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createLab, updateLab, type LabActionResult } from "@/app/labs/actions";
import {
  formatChangePath,
  formatEditAge,
} from "@/components/labs/edit-log-format";
import { DAY_LABELS } from "@/lib/labs/hours";
import {
  CONTACT_CHANNELS,
  type ChemProcess,
  type ContactChannel,
  type FilmFormat,
  type HistoryChange,
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
import {
  applyMerge,
  defaultResolution,
  planMerge,
  type MergePlan,
  type Resolution,
} from "./conflict";
import {
  clearDraft,
  draftKey,
  loadDraft,
  saveDraft,
  type StoredDraft,
} from "./draft-storage";
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
  /**
   * The lab a save is written against — derived, not synced.
   *
   * This is the difference between recovering from a conflict and looping on
   * it. `updateLab` refuses a stale version, and while the version came
   * straight off an unchanging prop, every retry re-sent the same stale number
   * and failed identically — with the button still enabled, so the only way
   * out was a reload that discarded everything typed.
   *
   * A merge stores the lab it rebased onto here. Whichever of the two is newer
   * wins, so a `revalidatePath` that lands a fresher prop is picked up without
   * an effect to copy it across.
   */
  const [rebased, setRebased] = useState<LabDetail | null>(null);
  const base =
    rebased !== null && (lab === undefined || rebased.version > lab.version)
      ? rebased
      : lab;

  // The baseline is a draft rather than the lab row, so what is compared is two
  // objects of the same shape. Comparing "180" against 180 is a formatting
  // question, and answering it in two places is how a form starts reporting
  // changes nobody made.
  //
  // Held in state rather than a ref because the diff reads it during render,
  // and a ref read during render is a value React does not promise is stable.
  // It is set exactly once more than it used to be: a merge moves the baseline
  // to the lab the merge was resolved against.
  const [initial, setInitial] = useState<LabDraft>(() =>
    lab ? draftFromLab(lab) : emptyDraft(),
  );
  const [draft, setDraft] = useState<LabDraft>(() =>
    lab ? draftFromLab(lab) : emptyDraft(),
  );

  /** Set when a save lost the race and there is a merge to resolve. */
  const [conflict, setConflict] = useState<{
    server: LabDetail;
    plan: MergePlan;
    resolution: Resolution;
  } | null>(null);

  const creating = lab === undefined;
  const gate = createGate(draft);
  const changes = useMemo(
    () => (creating ? [] : diffDraft(initial, draft)),
    [creating, initial, draft],
  );

  // ── keeping the draft on the device ────────────────────────────────────
  const storageKey = useMemo(() => draftKey(lab?.id), [lab?.id]);
  const [restorable, setRestorable] = useState<StoredDraft | null>(null);
  /**
   * Whether it is safe to start writing.
   *
   * False only while an offer to restore is on screen: persisting on mount
   * would overwrite the very draft being offered, which is the one bug this
   * whole mechanism exists to avoid.
   */
  const [restoreSettled, setRestoreSettled] = useState(true);
  const readStorage = useRef(false);

  // localStorage cannot be read while rendering — this component is a client
  // component but still server-rendered, so a lazy `useState` initialiser
  // would run where `window` does not exist. Reading after mount and setting
  // state is the only order available, which is why the rule is suppressed
  // here and nowhere else in this file.
  useEffect(() => {
    if (readStorage.current) return;
    readStorage.current = true;
    const stored = loadDraft(storageKey);
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setRestorable(stored);
    setRestoreSettled(false);
  }, [storageKey]);

  useEffect(() => {
    if (!restoreSettled) return;
    // Debounced: a keystroke is not a save, and serialising the whole draft on
    // every one of them is work nobody asked for.
    const timer = window.setTimeout(() => {
      saveDraft(storageKey, {
        baseVersion: base?.version ?? 0,
        draft,
        note,
        savedAt: Date.now(),
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, note, base?.version, storageKey, restoreSettled]);

  const update = (change: (next: LabDraft) => void) =>
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });

  /**
   * One submit path, with the baseline and the draft passed in rather than
   * read from state.
   *
   * A merge sets three pieces of state and submits in the same tick, and the
   * updates are not visible to this closure when it runs. Passing them makes
   * the second conflict in a row plan against the right baseline instead of
   * the one two saves ago.
   */
  function submitUpdate(
    target: LabDetail,
    baseline: LabDraft,
    nextDraft: LabDraft,
    nextChanges: HistoryChange[],
  ) {
    setResult(null);
    startTransition(async () => {
      const outcome = await updateLab(
        target.id,
        target.version,
        nextChanges,
        note,
      );
      setResult(outcome);

      if (outcome.ok) {
        clearDraft(storageKey);
        router.push(`/labs/${outcome.id}`);
        return;
      }

      // `current` is null when the lab became unreadable between the refused
      // write and the re-read. There is nothing to merge against, so the
      // message stands alone and no panel opens.
      if (outcome.reason === "conflict" && outcome.current) {
        const plan = planMerge(baseline, nextDraft, outcome.current);
        setConflict({
          server: outcome.current,
          plan,
          resolution: defaultResolution(plan),
        });
      }
    });
  }

  function save() {
    if (creating) {
      setResult(null);
      startTransition(async () => {
        const outcome = await createLab(draftToCreateInput(draft), note);
        setResult(outcome);
        if (outcome.ok) {
          clearDraft(storageKey);
          router.push(`/labs/${outcome.id}`);
        }
      });
      return;
    }
    submitUpdate(base!, initial, draft, changes);
  }

  /**
   * Rebase onto the lab as it now is, then save.
   *
   * Resetting the baseline is the load-bearing half: the merged draft is
   * expressed relative to the server's state, so diffing it against the old
   * baseline would re-send leaves that are already committed.
   */
  function mergeAndSave() {
    if (!conflict) return;
    const merged = applyMerge(
      draft,
      conflict.server,
      conflict.plan,
      conflict.resolution,
    );
    const nextBaseline = draftFromLab(conflict.server);
    const nextChanges = diffDraft(nextBaseline, merged);

    setRebased(conflict.server);
    setInitial(nextBaseline);
    setDraft(merged);
    setConflict(null);

    // Taking every contested slot from the server can leave nothing to write.
    // That is a resolved conflict, not a failed save.
    if (nextChanges.length === 0) {
      setResult({ ok: false, reason: "unchanged" });
      return;
    }
    submitUpdate(conflict.server, nextBaseline, merged, nextChanges);
  }

  /** Abandon this editor's version and continue from the server's. */
  function takeServerVersion() {
    if (!conflict) return;
    const theirs = draftFromLab(conflict.server);
    setRebased(conflict.server);
    setInitial(theirs);
    setDraft(theirs);
    setConflict(null);
    setResult(null);
    clearDraft(storageKey);
  }

  function restoreDraft() {
    if (restorable) {
      setDraft(restorable.draft);
      setNote(restorable.note);
    }
    setRestorable(null);
    setRestoreSettled(true);
  }

  function discardStoredDraft() {
    clearDraft(storageKey);
    setRestorable(null);
    setRestoreSettled(true);
  }

  // An unresolved conflict blocks the save outright. Leaving it enabled is
  // what made the old failure a loop rather than a message.
  const canSave = creating
    ? gate.ready && !pending
    : changes.length > 0 && !pending && conflict === null;

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

      {restorable && (
        <RestoreOffer
          stored={restorable}
          currentVersion={base?.version}
          onRestore={restoreDraft}
          onDiscard={discardStoredDraft}
        />
      )}

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

      <Problems result={result} hasPanel={conflict !== null} />

      {conflict && (
        <ConflictResolver
          server={conflict.server}
          plan={conflict.plan}
          resolution={conflict.resolution}
          pending={pending}
          onChoose={(slot, side) =>
            setConflict((current) =>
              current === null
                ? current
                : {
                    ...current,
                    resolution: { ...current.resolution, [slot]: side },
                  },
            )
          }
          onMerge={mergeAndSave}
          onTakeServer={takeServerVersion}
          onDismiss={() => setConflict(null)}
        />
      )}

      <div className="grains-actions">
        <button
          type="submit"
          className="grains-save"
          disabled={!canSave}
          aria-busy={pending}
        >
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
function Problems({
  result,
  hasPanel,
}: {
  result: LabActionResult | null;
  hasPanel: boolean;
}) {
  if (result === null || result.ok) return null;

  if (result.reason === "conflict") {
    // With a panel open the message belongs in it, next to the choice it is
    // asking for. Repeating it here would be two voices on one problem.
    if (hasPanel) return null;
    return (
      <div className="grains-problem" role="alert">
        <strong>This lab cannot be loaded any more.</strong>
        <p style={{ margin: "6px 0 0" }}>
          Somebody edited it while you had it open, and it no longer reads back
          from here. Nothing was saved and your text is still on this page.
        </p>
      </div>
    );
  }

  if (result.reason === "cascade") {
    return (
      <div className="grains-problem" role="alert">
        <strong>
          Removing that process would delete pricing this save does not mention.
        </strong>
        <ul>
          {result.missing.map((path) => (
            <li key={path}>{formatChangePath(path)}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (result.reason === "rejected") {
    return (
      <div className="grains-problem" role="alert">
        {result.message}
      </div>
    );
  }

  if (result.reason === "unchanged") {
    return (
      <div className="grains-problem" role="alert">
        Nothing changed, so nothing was saved.
      </div>
    );
  }

  return (
    <div className="grains-problem" role="alert">
      <strong>That could not be saved.</strong>
      <ul>
        {result.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The offer to bring back what somebody typed last time.
 *
 * An offer rather than an automatic restore, and that is the whole design.
 * Silently replaying a draft typed against version 4 onto a lab that is now
 * version 7 would revert three edits nobody asked it to revert — the failure
 * this form is otherwise careful to make impossible. So the staleness is
 * stated and the choice is theirs.
 */
function RestoreOffer({
  stored,
  currentVersion,
  onRestore,
  onDiscard,
}: {
  stored: StoredDraft;
  currentVersion: number | undefined;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const stale =
    currentVersion !== undefined && stored.baseVersion < currentVersion;

  return (
    <div className="grains-restore">
      <div>
        <strong>
          You have unsaved edits from{" "}
          {formatEditAge(new Date(stored.savedAt).toISOString())}.
        </strong>
        <p className="grains-restore-note">
          {stale
            ? "The lab has changed since you typed them, so restoring will ask you what to keep."
            : "They were kept on this device only."}
        </p>
      </div>
      <div className="grains-restore-actions">
        <button type="button" className="grains-secondary" onClick={onRestore}>
          Restore
        </button>
        <button type="button" className="grains-ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

/**
 * Resolving a version collision.
 *
 * In place of the action row rather than in a dialog: the fields being compared
 * are on this page, and a modal would cover the evidence while asking about it.
 * It is a `region`, not an `alertdialog`, for the same reason — nothing here
 * should trap focus.
 *
 * Contested rows default to **theirs**. Defaulting to mine would quietly revert
 * a stranger's correction, which is the exact failure the leaf-path diff exists
 * to prevent; making an override deliberate is the point. Most conflicts have
 * no contested rows at all — two people editing different parts of a lab — and
 * those collapse to one sentence and one button.
 */
function ConflictResolver({
  server,
  plan,
  resolution,
  pending,
  onChoose,
  onMerge,
  onTakeServer,
  onDismiss,
}: {
  server: LabDetail;
  plan: MergePlan;
  resolution: Resolution;
  pending: boolean;
  onChoose: (slot: string, side: "mine" | "theirs") => void;
  onMerge: () => void;
  onTakeServer: () => void;
  onDismiss: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus moves to the heading because the save did not happen and nothing
  // else says so to a keyboard or screen-reader user: the button they pressed
  // is now disabled and the panel is below it.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const editor = server.lastEditorUsername
    ? `@${server.lastEditorUsername}`
    : "Somebody";
  const when = server.lastEditedAt ? formatEditAge(server.lastEditedAt) : null;

  return (
    <section
      className="grains-conflict"
      role="region"
      aria-labelledby="grains-conflict-heading"
    >
      <div className="grains-conflict-head">
        <h2
          id="grains-conflict-heading"
          ref={heading}
          tabIndex={-1}
          className="grains-conflict-title"
        >
          {editor} edited this lab while you had it open
        </h2>
        <p className="grains-conflict-sub">
          {when ? `${when} · ` : ""}it is now version {server.version}. Nothing
          you typed has been lost.
        </p>
      </div>

      <div className="grains-conflict-body">
        {plan.autoLabels.length > 0 && (
          <p className="grains-conflict-auto">
            <strong>
              {plan.autoLabels.length} of their change
              {plan.autoLabels.length === 1 ? "" : "s"} do
              {plan.autoLabels.length === 1 ? "es" : ""} not touch yours
            </strong>{" "}
            and will be kept: {plan.autoLabels.join(", ")}.
          </p>
        )}

        {plan.contested.length === 0 ? (
          <p className="grains-conflict-clear">
            Nothing you changed overlaps what they changed, so this merges
            cleanly.
          </p>
        ) : (
          <ul className="grains-conflict-rows">
            {plan.contested.map((row) => {
              const chosen = resolution[row.slot] ?? "theirs";
              const labelId = `conflict-${row.slot.replace(/[^a-z0-9]/gi, "-")}`;
              return (
                <li key={row.slot} className="grains-conflict-row">
                  <div className="grains-conflict-field">
                    <div id={labelId} className="grains-conflict-name">
                      {row.label}
                    </div>
                    {row.leaves.map((leaf) => (
                      <div key={leaf.label} className="grains-conflict-values">
                        {row.leaves.length > 1 && (
                          <span className="grains-conflict-leaf">
                            {leaf.label}:{" "}
                          </span>
                        )}
                        <s>{leaf.base}</s> → {leaf.theirs}{" "}
                        <span className="grains-conflict-side">theirs</span> ·{" "}
                        {leaf.mine}{" "}
                        <span className="grains-conflict-side">yours</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="grains-conflict-choice"
                    role="radiogroup"
                    aria-labelledby={labelId}
                  >
                    {(["mine", "theirs"] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        role="radio"
                        aria-checked={chosen === side}
                        data-on={chosen === side}
                        className="grains-conflict-pick"
                        onClick={() => onChoose(row.slot, side)}
                      >
                        {side === "mine" ? "Keep mine" : "Take theirs"}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grains-conflict-foot">
        <button
          type="button"
          className="grains-save"
          onClick={onMerge}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Saving…" : "Merge and save"}
        </button>
        <button
          type="button"
          className="grains-secondary"
          onClick={onDismiss}
          disabled={pending}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="grains-ghost"
          onClick={onTakeServer}
          disabled={pending}
        >
          Discard mine, take theirs
        </button>
      </div>
    </section>
  );
}

export { CELL_KEYS };
