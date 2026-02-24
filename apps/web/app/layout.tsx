import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Envelope",
  description: "Self-hosted keyboard-first Gmail client",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
