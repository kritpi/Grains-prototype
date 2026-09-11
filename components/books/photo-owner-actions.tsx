"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deletePhoto, updatePhotoMetadata } from "@/app/photos/actions";
import { StockPicker } from "@/components/lab-form/stock-picker";
import { FILM_FORMATS, type FilmFormat } from "@/lib/labs/paths";
import type { PhotoDetail } from "@/lib/queries/photos";

/**
 * What the uploader sees where everybody else sees Connect: Edit metadata, and
 * Delete.
 *
 * Connect is absent rather than disabled, because connecting your own Photo is
 * a no-op under the reference model — it is already yours (PRD D #12). That is
 * not the same as filing it, which is ordinary curation and stays allowed: the
 * page renders `ConnectSheet` in its `file` mode alongside these two. Reading
 * the absence of Connect as "an owner has nothing to add to a photobook" is
 * what left an uploaded photograph with no way into one.
 *
 * **Delete states the cascade in plain numbers before it happens.** Under
 * PRD D #6 this is an uploader's only recourse over how their work is being
 * reused, and under PRD D #8 it removes the Photo from every Photobook that
 * connected it with no tombstone and no notice to those curators. That is a
 * lot of consequence for one button, so the count is shown rather than
 * described — "removes it from 7 photobooks" is a fact somebody can weigh, and
 * "this cannot be undone" is not.
 */
export function PhotoOwnerActions({
  photo,
  alsoAppearsIn,
  scannerModels,
  afterDelete,
}: {
  photo: PhotoDetail;
  alsoAppearsIn: number;
  scannerModels: string[];
  afterDelete: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "editing" | "confirming">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [filmStock, setFilmStock] = useState<{
    id: string;
    name: string;
  } | null>(
    photo.filmStockId && photo.filmStockName
      ? { id: photo.filmStockId, name: photo.filmStockName }
      : null,
  );
  const [format, setFormat] = useState<FilmFormat | null>(photo.format);
  const [frameSize, setFrameSize] = useState(photo.frameSize ?? "");
  const [camera, setCamera] = useState(photo.camera ?? "");
  const [scannerModel, setScannerModel] = useState(photo.scannerModel ?? "");
  const [chemistry, setChemistry] = useState(photo.chemistry ?? "");

  function save() {
    setProblem(null);
    startTransition(async () => {
      const result = await updatePhotoMetadata(photo.id, {
        filmStockId: filmStock?.id ?? null,
        format,
        frameSize: frameSize.trim() || null,
        camera: camera.trim() || null,
        scannerModel: scannerModel || null,
        chemistry: chemistry.trim() || null,
      });

      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setMode("idle");
      router.refresh();
    });
  }

  function remove() {
    setProblem(null);
    startTransition(async () => {
      const result = await deletePhoto(photo.id);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      router.replace(afterDelete);
      router.refresh();
    });
  }

  if (mode === "editing") {
    return (
      <form
        className="grains-sheet"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) save();
        }}
      >
        <div className="grains-upload-field">
          <span className="grains-form-label">FILM STOCK</span>
          {filmStock ? (
            <div className="grains-upload-chosen">
              <span>{filmStock.name}</span>
              <button
                type="button"
                className="grains-secondary"
                onClick={() => setFilmStock(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <StockPicker
              existingIds={[]}
              onPick={(stock) =>
                setFilmStock({ id: stock.filmStockId, name: stock.name })
              }
            />
          )}
        </div>

        <div className="grains-upload-field">
          <span className="grains-form-label">FORMAT</span>
          <div className="grains-chips">
            {FILM_FORMATS.map((value) => (
              <button
                key={value}
                type="button"
                className="grains-toggle"
                data-on={format === value}
                onClick={() =>
                  setFormat((current) => (current === value ? null : value))
                }
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <label className="grains-upload-field">
          <span className="grains-form-label">FRAME SIZE</span>
          <input
            className="grains-input-cell"
            value={frameSize}
            placeholder="6x7, 3:2"
            onChange={(event) => setFrameSize(event.target.value)}
          />
        </label>

        <label className="grains-upload-field">
          <span className="grains-form-label">CAMERA</span>
          <input
            className="grains-input-cell"
            value={camera}
            placeholder="Pentax 67"
            onChange={(event) => setCamera(event.target.value)}
          />
        </label>

        <label className="grains-upload-field">
          <span className="grains-form-label">SCANNER</span>
          <select
            className="grains-input-cell"
            value={scannerModel}
            onChange={(event) => setScannerModel(event.target.value)}
          >
            <option value="">Not recorded</option>
            {scannerModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>

        <label className="grains-upload-field">
          <span className="grains-form-label">CHEMISTRY</span>
          <input
            className="grains-input-cell"
            value={chemistry}
            placeholder="C-41"
            onChange={(event) => setChemistry(event.target.value)}
          />
        </label>

        <div className="grains-photo-actions">
          <button type="submit" className="grains-action" disabled={pending}>
            {pending ? "Saving…" : "Save metadata"}
          </button>
          <button
            type="button"
            className="grains-confirm-cancel"
            onClick={() => setMode("idle")}
            disabled={pending}
          >
            Cancel
          </button>
        </div>

        {problem ? <div className="grains-problem">{problem}</div> : null}
      </form>
    );
  }

  return (
    <>
      <div className="grains-photo-actions">
        <button
          type="button"
          className="grains-action"
          onClick={() => setMode("editing")}
        >
          Edit metadata
        </button>
        <button
          type="button"
          className="grains-action grains-action-danger"
          onClick={() => setMode("confirming")}
        >
          Delete
        </button>
      </div>

      {mode === "confirming" ? (
        <div className="grains-confirm">
          <p>
            {alsoAppearsIn === 0
              ? "This photograph is in no photobook. Deleting removes it and its file for good."
              : `This photograph is in ${alsoAppearsIn} ${
                  alsoAppearsIn === 1 ? "photobook" : "photobooks"
                }. Deleting removes it from ${
                  alsoAppearsIn === 1 ? "that one" : "all of them"
                }, including other people's, with no notice to them.`}
          </p>
          <div className="grains-photo-actions">
            <button
              type="button"
              className="grains-confirm-go"
              onClick={remove}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              className="grains-confirm-cancel"
              onClick={() => setMode("idle")}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {problem ? <div className="grains-problem">{problem}</div> : null}
    </>
  );
}
