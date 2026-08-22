import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thermal Decision Engine | FortyGuard Hackathon'26",
  description: "Hyperlocal temperature intelligence turned into actionable operational decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` is applied unconditionally: the Decision Workspace is a dark-canvas
    // operational surface. Colours resolve from the `.dark` token block in globals.css.
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
