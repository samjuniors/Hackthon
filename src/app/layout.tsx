import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider, THEME_SCRIPT } from "@/components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thermal Decision Engine | FortyGuard Hackathon'26",
  description:
    "Hyperlocal FortyGuard temperature intelligence turned into actionable WHERE + WHEN operational decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the ThemeScript toggles the 'dark' class
    // synchronously before hydration — React sees a match, no mismatch warning.
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/*
          ThemeScript — runs synchronously before first paint.
          Reads localStorage preference (or system preference) and applies/removes
          the 'dark' class on <html> before React hydrates.
          This prevents any flash of the wrong theme.
        */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
