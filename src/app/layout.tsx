import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Largada de Fotógrafos",
  description: "Concurso de fotografia Largada de Fotógrafos — Azenhas da Serra, Bread and Spa.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
