import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RISK-XVII Online Lab",
  description: "Run RISK-XVII .mi programs in a browser"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
