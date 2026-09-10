import type { Metadata } from "next";
import { Geist, Instrument_Serif, Noto_Sans_Thai } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { SiteHeader } from "@/components/layout/site-header";
import { currentLang } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";

import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });

// Editorial serif for headings and series titles. Instrument Serif ships a
// single weight; the design direction never asks for a bolder one.
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
});

/**
 * Thai has to have its own face, not a fallback that happens to render.
 *
 * Geist ships no Thai, so without this the browser substitutes whatever it has
 * — usually a face with different metrics and no matching weights, which is why
 * Thai on an unprepared site looks pasted in. Two weights because the design
 * system pairs them deliberately: 400 for body, 600 where Latin would use 500,
 * since Thai at the same optical size needs the extra weight to hold up against
 * its vowel and tone marks.
 *
 * It loads on every page rather than only Thai ones: the language is a cookie,
 * so any page can be the Thai one, and a font that arrives after the toggle is
 * a visible reflow.
 */
const thai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "600"],
  variable: "--font-thai",
});

export const metadata: Metadata = {
  title: "Grains",
  description:
    "Find film-developing labs and film stocks, and keep a quiet photobook of your work.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // `<html lang>` is not decoration: it is what tells a screen reader which
  // voice to use and a browser which hyphenation and font stack to apply. It
  // was hardcoded "en" while the schema had carried `name_th` since the first
  // migration.
  const lang = await currentLang();

  return (
    <html
      lang={lang}
      className={cn(sans.variable, serif.variable, thai.variable)}
    >
      <body>
        {/* Map viewport and lab filters live in the URL rather than in React
            state, so a search can be linked to and restored. nuqs needs this
            adapter above every component that reads or writes a query param. */}
        <NuqsAdapter>
          <SiteHeader />
          {children}
        </NuqsAdapter>
      </body>
    </html>
  );
}
