import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Health Check",
  description:
    "Lightweight feedback for delivery teams. Rate how things are going, track trends over time, and surface what needs attention.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
