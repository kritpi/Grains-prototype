/**
 * The two browser-side halves of an upload, shared by every surface that has
 * one.
 *
 * Extracted from `photo-uploader.tsx` when the lab form grew an atmosphere
 * uploader. They are the parts with no opinion about *what* is being uploaded:
 * measure the image, then PUT the bytes. Everything above them — which action
 * signs the URL, what metadata is collected, what confirm does — differs
 * between a community Photo and a lab's venue documentation, and is deliberately
 * not shared.
 */

/**
 * The image's true pixel dimensions, read in the browser.
 *
 * They are stored so a grid can reserve the true aspect ratio before the image
 * loads, which is what stops a photobook reflowing as it fills in. Reading them
 * here rather than on the server is the only option that does not contradict
 * "photos never transit the app server" — and they are display data, so a
 * client that lies about them makes its own layout wrong and nothing else.
 *
 * The caller owns the returned object URL and must revoke it.
 */
export function readDimensions(
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
export function putObject(
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
