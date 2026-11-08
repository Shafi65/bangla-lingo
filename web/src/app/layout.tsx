import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no network needed at build time).
import "@fontsource-variable/nunito";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";
import { CourseProvider } from "@/components/CourseContext";
import { getCourse } from "@/lib/content";

export const metadata: Metadata = {
  title: "BanglaLingo: learn Bengali",
  description:
    "Bite-sized lessons for English speakers learning Bengali (বাংলা): script, vocabulary and everyday phrases.",
  applicationName: "BanglaLingo",
  appleWebApp: { capable: true, title: "BanglaLingo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#006a4e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const scriptLessonIds = getCourse()
    .units.filter((u) => u.track === "script")
    .flatMap((u) => u.lessons.map((l) => l.id));
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <CourseProvider scriptLessonIds={scriptLessonIds}>{children}</CourseProvider>
      </body>
    </html>
  );
}
