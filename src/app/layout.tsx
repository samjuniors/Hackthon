import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
