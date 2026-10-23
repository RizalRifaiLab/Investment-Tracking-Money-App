import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["400", "600", "800"] });

export const metadata: Metadata = {
  title: "Tumbuh",
  description: "Every rupiah, counted toward the goal you set.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f3f2f2" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
