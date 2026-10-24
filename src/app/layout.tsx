import type { Metadata, Viewport } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500"],
  variable: "--font-kanit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Expert Watch AI",
  description: "Expert Watch AI Customer Service — admin dashboard",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={kanit.variable}>
      <body>{children}</body>
    </html>
  );
}
