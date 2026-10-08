import type { Metadata } from "next";
import { Fredoka, Archivo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Fredoka ≈ alternative libre à Coco Goose (titres Kooks)
const fredoka = Fredoka({
  variable: "--font-kooks-title",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Archivo ≈ alternative libre à Univers LT STD (corps de texte Kooks)
const archivo = Archivo({
  variable: "--font-kooks-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
      <body
        className={`${fredoka.variable} ${archivo.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
