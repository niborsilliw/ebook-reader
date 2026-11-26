import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nancy", template: "%s · Nancy" },
  applicationName: "Nancy",
  appleWebApp: { capable: true, title: "Nancy", statusBarStyle: "default" },
  description: "EPUB reader with a research assistant",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <head>
        <link
          rel="preload"
          href="/fonts/libre-baskerville/libre-baskerville-latin-400-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="antialiased">
        <LanguageProvider lang={lang}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  );
}
