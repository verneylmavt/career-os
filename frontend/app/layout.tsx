import "./globals.css";
import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "CareerOS — your AI career copilot",
  description: "Discover, shortlist, tailor, and prep — your entire job hunt, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <NavBar />
        <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
