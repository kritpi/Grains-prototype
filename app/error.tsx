"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { Notice } from "@/components/layout/notice";
import { isLang, t, type Lang } from "@/lib/i18n";

/**
 * The error boundary for everything under the root layout.
 *
 * Must be a Client Component — Next needs `reset` to be callable in the
 * browser — and it renders *inside* the root layout, so the header stays put
 * and the reader is never stranded on a bare page.
 *
 * `error.message` is deliberately not shown. In production Next replaces it
 * with a generic string anyway, and in development printing a raw Postgres or
 * Auth.js message into the page teaches a habit that leaks internals the day
 * it is copied to a surface that is not a boundary. `digest` is the part that
 * is useful and safe: it is the hash Next also writes to the server log, so a
 * reader can quote it and it can be found.
 *
 * This does not catch failures in the root layout itself; that needs
 * `global-error.tsx`, which has to ship its own `<html>` and `<body>` and so
 * cannot use the chrome or this component. It is not built, because the root
 * layout does no data fetching — it renders fonts, the nuqs adapter and the
 * header — and a boundary for code that cannot currently throw is a file that
 * rots. Add it when the layout grows a data dependency.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The language, read off the element the root layout already stamped it on.
  //
  // A Client Component cannot call `currentLang()` — `cookies()` is
  // server-only — and an error boundary receives only `error` and `reset`, so
  // there is no prop to pass it through. `<html lang>` is the same value from
  // the same cookie and is already in the document.
  //
  // `useSyncExternalStore` rather than state-in-an-effect, which is the obvious
  // shape and is wrong twice: it is a lint error here (`set-state-in-effect`),
  // and it renders English for a frame before correcting itself. This hook
  // exists for exactly this — a value read from outside React, with separate
  // server and client snapshots — so React reconciles the two instead of the
  // page flashing through the wrong one.
  //
  // The subscribe callback is a no-op: `<html lang>` is written once per
  // document by the root layout and cannot change without a navigation.
  const declared = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.lang,
    () => "en",
  );
  const lang: Lang = isLang(declared) ? declared : "en";

  useEffect(() => {
    // Phase 4 installs Sentry; this is the call site it wants. Until then the
    // console is what a developer actually has, and in production this is the
    // only place the client learns anything about the failure at all.
    console.error(error);
  }, [error]);

  return (
    <Notice
      title={t(lang, "error.title")}
      actions={
        <>
          <button
            type="button"
            onClick={reset}
            className="border border-foreground bg-foreground px-3 py-1.5 font-sans text-xs text-background hover:bg-transparent hover:text-foreground"
          >
            {t(lang, "error.retry")}
          </button>
          <Link
            href="/labs"
            className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
          >
            {t(lang, "notFound.findLab")}
          </Link>
        </>
      }
    >
      {t(lang, "error.body")}
      {error.digest ? (
        <>
          {" "}
          <span className="text-quiet">
            {t(lang, "error.reference")} {error.digest}.
          </span>
        </>
      ) : null}
    </Notice>
  );
}
