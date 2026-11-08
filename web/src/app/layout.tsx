import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no network needed at build time).
import "@fontsource-variable/nunito";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";

export const metadata: Metadata = {
  title: "BanglaLingo: learn Bengali",
  description:
    "Bite-sized lessons for English speakers learning Bengali (বাংলা): script, vocabulary and everyday phrases.",
};

export const viewport: Viewport = {
  themeColor: "#006a4e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
