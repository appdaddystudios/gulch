import type { Metadata } from "next";
import { Ubuntu } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Brand typeface — same Ubuntu weights the mobile app loads.
const ubuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-ubuntu",
});

export const metadata: Metadata = {
  title: "Gulch Admin",
  description: "Gulch homepage admin dashboard"
};

type RootLayoutProps = {
  readonly children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={ubuntu.variable}>
      <body>{children}</body>
    </html>
  );
}
