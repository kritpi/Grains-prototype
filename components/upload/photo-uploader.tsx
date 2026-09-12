"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { confirmPhoto, requestUploadUrl } from "@/app/photos/actions";
import { putObject, readDimensions } from "@/components/upload/browser-upload";
import { StockPicker } from "@/components/lab-form/stock-picker";
import { FILM_FORMATS, type FilmFormat } from "@/lib/labs/paths";
import {
  checkUpload,
  formatBytes,
  UPLOAD_ACCEPT,
  type LimitCheck,
} from "@/lib/photos/limits";

// The film-stock picker embedded below is the contribution form's component and
// carries that stylesheet's classes, so it comes with them.
import "@/components/lab-form/lab-form.css";
import "./photo-uploader.css";

/**
 * Upload a Photo.
 *
 * The three-step flow exists because photos never transit the app server: ask
 * for a signature, PUT the bytes to R2, then confirm. What that buys is that a
 * 20 MB scan never occupies a serverless function; what it costs is that this
 * component owns the middle step, including its progress and its failures.
 *
 * The bytes are uploaded on save rather than on pick, deliberately. Uploading
 * eagerly while somebody fills in the metadata would feel faster and would also
 * spend a slot against a cap the person has not yet decided to use, then leave
 * the object to a lifecycle rule when they change their mind. Making it happen
 * on the action that means "I want this" keeps the cap honest.
 *
 * There is no draft state to manage: a Photo is public and Connectable the
 * moment it is confirmed (PRD D #4).
 *
 * No prototype screen backs this — see photo-uploader.css for the deviation
 * note and the gap plan's J10.
 */

type Picked = {
  file: File;
  /** An object URL, revoked whenever it is replaced or cleared. */
  url: string;
  width: number;
  height: number;
};

type Phase =
  | { name: "idle" }
  | { name: "uploading"; progress: number }
  | { name: "saving" };

export type PhotoUploaderProps = {
  /** The curated roster, from `listFormCatalog`. A model is a foreign key. */
  scannerModels: string[];
  /**
   * Set when uploading from inside one of the caller's own Photobooks: the
   * Photo joins it. A convenience, not a coupling — the Photo is independent
   * and may belong to no Photobook at all (PRD D #10).
   */
  photobookId?: string;
};

export function PhotoUploader({
  scannerModels,
  photobookId,
}: PhotoUploaderProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const [picked, setPicked] = useState<Picked | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [problem, setProblem] = useState<string | null>(null);

  const [filmStock, setFilmStock] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [format, setFormat] = useState<FilmFormat | null>(null);
  const [frameSize, setFrameSize] = useState("");
  const [camera, setCamera] = useState("");
  const [scannerModel, setScannerModel] = useState("");
  const [chemistry, setChemistry] = useState("");

  const busy = phase.name !== "idle";

  function clearPicked() {
    setPicked((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function reset() {
    clearPicked();
    setFilmStock(null);
    setFormat(null);
    setFrameSize("");
    setCamera("");
    setScannerModel("");
    setChemistry("");
    setPhase({ name: "idle" });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function choose(file: File) {
    setProblem(null);

    // The same rule the server applies after the object lands, run here so a
    // doomed 400 MB upload is refused before it starts rather than after. This
    // check is a courtesy; the server's is the control.
    const allowed: LimitCheck = checkUpload({
      contentType: file.type,
      bytes: file.size,
    });
    if (!allowed.ok) {
      setProblem(allowed.message);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    try {
      const measured = await readDimensions(file);
      clearPicked();
      setPicked({ file, ...measured });
    } catch {
      setProblem("That image could not be read. Try a different file.");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function save() {
    if (!picked) return;
    setProblem(null);

    startTransition(async () => {
      setPhase({ name: "uploading", progress: 0 });

      const signed = await requestUploadUrl({
        kind: "photo",
        contentType: picked.file.type,
        bytes: picked.file.size,
      });

      if (!signed.ok) {
        setPhase({ name: "idle" });
        setProblem(
          signed.reason === "cap"
            ? `You have used all ${signed.cap} of your uploads. Delete one to make room.`
            : signed.message,
        );
        return;
      }

      try {
        await putObject(signed.url, picked.file, (progress) =>
          setPhase({ name: "uploading", progress }),
        );
      } catch {
        setPhase({ name: "idle" });
        setProblem(
          "The upload did not finish. Check your connection and try again.",
        );
        return;
      }

      setPhase({ name: "saving" });
      const saved = await confirmPhoto({
        key: signed.key,
        width: picked.width,
        height: picked.height,
        photobookId,
        metadata: {
          filmStockId: filmStock?.id ?? null,
          format,
          frameSize: frameSize.trim() || null,
          camera: camera.trim() || null,
          scannerModel: scannerModel || null,
          chemistry: chemistry.trim() || null,
        },
      });

      if (!saved.ok) {
        setPhase({ name: "idle" });
        setProblem(
          saved.reason === "cap"
            ? `You have used all ${saved.cap} of your uploads. Delete one to make room.`
            : saved.message,
        );
        return;
      }

      reset();
      router.refresh();
    });
  }

  return (
    <div className="grains-upload">
      <input
        ref={fileInput}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
        }}
      />

      {picked === null ? (
        <button
          type="button"
          className="grains-upload-drop"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <span className="grains-upload-headline">Upload a photograph</span>
          <span className="grains-upload-lede">
            JPEG, PNG, WebP or AVIF — the frame is kept as shot, never cropped.
          </span>
        </button>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- an object URL
              for a local file: there is nothing for the loader to transform, and
              next/image would only add a layout wrapper around a blob. */}
          <img
            src={picked.url}
            width={picked.width}
            height={picked.height}
            alt="The photograph you are about to upload"
            className="grains-upload-frame"
          />

          <div className="grains-upload-chosen">
            <span>{picked.file.name}</span>
            <span className="grains-upload-status">
              {picked.width} × {picked.height} · {formatBytes(picked.file.size)}
            </span>
          </div>

          <div className="grains-upload-meta">
            <div className="grains-upload-field grains-upload-span">
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
          </div>

          {/* The rule this component sits inside: a Photo attributes to a film
              stock, a camera and a scanner model — never to the lab that
              developed it. There is no field for one here because there is no
              column for one in the schema, and the product says so out loud
              rather than only in a comment. */}
          <p className="grains-note">
            Never attributed to a lab — a scan reflects on the photographer and
            the film, not on the shop that developed it.
          </p>

          {phase.name === "uploading" ? (
            <div>
              <div className="grains-upload-bar">
                <div
                  className="grains-upload-bar-fill"
                  style={{ width: `${Math.round(phase.progress * 100)}%` }}
                />
              </div>
              <p className="grains-upload-status">
                Uploading — {Math.round(phase.progress * 100)}%
              </p>
            </div>
          ) : null}

          {phase.name === "saving" ? (
            <p className="grains-upload-status">Saving…</p>
          ) : null}

          <div className="grains-actions">
            <button
              type="button"
              className="grains-upload-save"
              disabled={busy}
              onClick={save}
            >
              {busy ? "Uploading…" : "Upload photograph"}
            </button>
            <button
              type="button"
              className="grains-secondary"
              disabled={busy}
              onClick={reset}
            >
              Cancel
            </button>
            <span className="grains-hours-closed">
              Live as soon as it is uploaded — there is no review queue.
            </span>
          </div>
        </>
      )}

      {problem ? <div className="grains-problem">{problem}</div> : null}
    </div>
  );
}
