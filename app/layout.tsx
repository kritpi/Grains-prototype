import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { SiteHeader } from "@/components/layout/site-header";
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

export const metadata: Metadata = {
  title: "Grains",
  description:
    "Find film-developing labs and film stocks, and keep a quiet photobook of your work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn(sans.variable, serif.variable)}>
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
