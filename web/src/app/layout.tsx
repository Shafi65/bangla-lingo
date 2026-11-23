import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no network needed at build time).
import "@fontsource-variable/nunito";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";
import { AccountRuntimeSlot } from "@/components/account/slots";
import { CourseProvider } from "@/components/CourseContext";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { OfflineStatus } from "@/components/offline/OfflineStatus";
import { getCourse } from "@/lib/content";
import { SITE_ROBOTS } from "@/lib/indexing";
import { THEME_SCRIPT } from "@/lib/ui/theme-script";

export const metadata: Metadata = {
  title: "BanglaLingo: learn Bengali",
  description:
    "Bite-sized lessons for English speakers learning Bengali (বাংলা): script, vocabulary and everyday phrases.",
  applicationName: "BanglaLingo",
  ...(SITE_ROBOTS ? { robots: SITE_ROBOTS } : {}),
  appleWebApp: { capable: true, title: "BanglaLingo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#006a4e" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1614" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: shrink the layout viewport for the on-screen keyboard so the fixed
  // Check/Continue footer stays above it (iOS ignores this and keeps its own behaviour).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const scriptLessonIds = getCourse()
    .units.filter((u) => u.track === "script")
    .flatMap((u) => u.lessons.map((l) => l.id));
  return (
    // data-theme is corrected before paint by THEME_SCRIPT (saved choice or OS setting).
    <html lang="en" data-theme="light" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <MotionProvider>
          <CourseProvider scriptLessonIds={scriptLessonIds}>{children}</CourseProvider>
        </MotionProvider>
        <OfflineStatus />
        <AccountRuntimeSlot />
      </body>
    </html>
  );
}
