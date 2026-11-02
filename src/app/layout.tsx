import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Polices chargées via CSS @font-face dans globals.css
// (fichiers .ttf dans /public/fonts/)
// au lieu de next/font/google qui nécessite un accès réseau à Google Fonts
// pendant le build — cet accès échoue sur Vercel de façon intermittente.

export const metadata: Metadata = {
  title: "Kooks — Suivi Ventes Agents",
  description: "Tableau de bord de suivi mensuel des ventes et commissions des agents commerciaux Kooks.",
  keywords: ["Kooks", "ventes", "commissions", "agents commerciaux", "suivi mensuel"],
  authors: [{ name: "Kooks" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="font-body antialiased bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
