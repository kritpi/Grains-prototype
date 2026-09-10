"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { confirmPhoto, requestUploadUrl } from "@/app/photos/actions";
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
              className="grains-save"
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

/**
 * The photograph's own pixel dimensions, read in the browser.
 *
 * They are stored so a grid can reserve the true aspect ratio before the image
 * loads, which is what stops a photobook reflowing as it fills in. Reading them
 * here rather than on the server is the only option that does not contradict
 * "photos never transit the app server" — and they are display data, so a
 * client that lies about them makes its own layout wrong and nothing else.
 */
function readDimensions(
  file: File,
): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () =>
      resolve({ url, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("not a readable image"));
    };
    image.src = url;
  });
}

/**
 * PUT the bytes to R2.
 *
 * `XMLHttpRequest` rather than `fetch`, for the one thing fetch still cannot
 * do: report upload progress. A film scan is several megabytes over a phone
 * connection, and a bar that moves is the difference between "working" and
 * "broken".
 *
 * `Content-Type` is sent even though it was not signed, and both halves of that
 * matter. It is not signed because a browser adds headers of its own and would
 * fail the signature (P19); it is sent because R2 records the header and serves
 * the object back with it, so omitting it would store every photograph as
 * `application/octet-stream` — and the server's own check reads that recorded
 * type. Unsigned headers do not participate in the signature, so this is
 * accepted rather than rejected.
 *
 * Which means the recorded type is the uploader's claim, not a measurement: a
 * determined caller can label anything `image/jpeg`. That is a deliberate limit
 * of P19 rather than an oversight — sniffing the bytes would mean streaming the
 * object through the app server, which is the one thing this whole flow exists
 * to avoid. It is bounded by an authenticated session and a per-user cap, and
 * the stored type is what the object is served as, so a mislabelled file is
 * served as a broken image rather than executed as anything.
 */
function putObject(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`R2 answered ${request.status}`));
    request.onerror = () => reject(new Error("network error"));

    request.send(file);
  });
}
