import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Analyseur de Ventes — Agents Commerciaux",
  description: "Importez un fichier Excel de ventes et obtenez une analyse complète : KPI, graphiques, classements et export CSV.",
  keywords: ["ventes", "analyse", "agents commerciaux", "Excel", "dashboard"],
  authors: [{ name: "Analyseur de Ventes" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Analyseur de Ventes",
    description: "Analysez vos ventes par agent commercial",
    siteName: "Analyseur de Ventes",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Analyseur de Ventes",
    description: "Analysez vos ventes par agent commercial",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
