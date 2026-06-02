import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StreamOS",
  description:
    "AI operating layer for creator growth, monetization, automation, and analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
