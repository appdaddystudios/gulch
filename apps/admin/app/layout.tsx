import { ClerkProvider, UserButton } from "@clerk/nextjs";
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
    <ClerkProvider>
      <html lang="en" className={ubuntu.variable}>
        <body>
          <header className="flex items-center justify-between border-b-2 border-oreo bg-brown-400 px-6 py-3 sm:px-10">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-khakis">
              Gulch Admin
            </p>
            <UserButton />
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
