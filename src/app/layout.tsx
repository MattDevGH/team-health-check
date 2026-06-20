import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App",
  description: "Generated from nextjs-fullstack-starter",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
