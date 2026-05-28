import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/ThemeProvider";
import { TruepaperToaster } from "@/components/TruepaperToaster";

import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui-sans",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Truepaper — Classroom forms & live sessions",
  description:
    "Teachers create forms and run live sessions; students join with a code—no account required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          {children}
          <TruepaperToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
