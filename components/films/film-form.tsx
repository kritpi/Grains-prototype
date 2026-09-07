"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createFilmStock,
  updateFilmStock,
  type FilmActionResult,
} from "@/app/films/actions";
import { FILM_FORMATS, type FilmFormat } from "@/lib/labs/paths";
import type { FilmStockDetail } from "@/lib/queries/films";

/**
 * Add or edit a catalog entry — one form, two modes, as the lab form is.
 *
 * Three fields, so unlike the lab form this sends the whole entry rather than a
 * diff and lets the action work out what moved. The leaves it produces are the
 * same shape a lab's are, so one edit log renders both; what differs is only
 * where the diff is computed, and for three columns on one row the transaction
 * is the honest place — it is also the only place that can see what somebody
 * else changed a second ago.
 */
export function FilmForm({ stock }: { stock?: FilmStockDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FilmActionResult | null>(null);

  const [name, setName] = useState(stock?.name ?? "");
  const [iso, setIso] = useState(stock ? String(stock.iso) : "");
  const [formats, setFormats] = useState<FilmFormat[]>(stock?.formats ?? []);
  const [note, setNote] = useState("");

  const creating = stock === undefined;
  const ready = name.trim() !== "" && iso.trim() !== "" && formats.length > 0;

  function save() {
    setResult(null);
    startTransition(async () => {
      const input = { name, iso, formats };
      const outcome = creating
        ? await createFilmStock(input)
        : await updateFilmStock(stock.id, stock.version, input, note);

      setResult(outcome);
      if (outcome.ok) router.push(`/films/${outcome.id}`);
    });
  }

  return (
    <form
      className="grains-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !pending) save();
      }}
    >
      <header>
        <div className="grains-form-eyebrow">
          {creating ? "Add a film stock" : "Suggest an edit"}
        </div>
        <h1 className="grains-form-title">{name.trim() || "Untitled stock"}</h1>
        <p className="grains-form-lede">
          A stock is one entry per name and ISO — 135 and 120 are formats of the
          same film, not two films. Saving goes live at once and is attributed
          to you.
        </p>
      </header>

      <label className="grains-form-field">
        <span className="grains-form-label">NAME</span>
        <input
          className="grains-input"
          value={name}
          placeholder="e.g. Kodak Portra 400"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="grains-form-field">
        <span className="grains-form-label">ISO</span>
        <input
          className="grains-input"
          value={iso}
          inputMode="numeric"
          placeholder="400"
          onChange={(event) => setIso(event.target.value)}
        />
      </label>

      <section>
        <div className="grains-form-label">FORMATS</div>
        <div className="grains-chips">
          {FILM_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              className="grains-toggle"
              data-on={formats.includes(format)}
              onClick={() =>
                setFormats((current) =>
                  current.includes(format)
                    ? current.filter((f) => f !== format)
                    : [...current, format],
                )
              }
            >
              {format}
            </button>
          ))}
        </div>
      </section>

      {!creating && (
        <label className="grains-form-field">
          <span className="grains-form-label">
            NOTE FOR THE HISTORY LOG · OPTIONAL
          </span>
          <input
            className="grains-input-cell"
            value={note}
            placeholder="e.g. 120 confirmed on the box"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      )}

      {result && !result.ok && (
        <div className="grains-problem">
          {result.reason === "conflict" ? (
            <>
              Somebody edited this stock while you had it open. Reload to see
              what changed.
            </>
          ) : result.reason === "rejected" ? (
            result.message
          ) : result.reason === "unchanged" ? (
            <>Nothing changed, so nothing was saved.</>
          ) : (
            <ul>
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grains-actions">
        <button
          type="submit"
          className="grains-save"
          disabled={!ready || pending}
        >
          {pending
            ? "Saving…"
            : creating
              ? "Add to catalog"
              : "Save — goes live now"}
        </button>
        {!ready && (
          <span className="grains-hours-closed">
            Needs a name, an ISO and at least one format.
          </span>
        )}
      </div>
    </form>
  );
}
