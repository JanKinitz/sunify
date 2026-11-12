import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunify – Finde dein Wunschwetter",
  description:
    "Wetter-Rückwärtssuche: Wo im Umkreis herrscht am Wochenende dein persönliches Wunschwetter?",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141b2d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
