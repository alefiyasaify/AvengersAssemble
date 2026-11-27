import type { Metadata } from "next";

import { publicEnv } from "@/shared/config/env";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: publicEnv.NEXT_PUBLIC_APP_NAME,
    template: `%s | ${publicEnv.NEXT_PUBLIC_APP_NAME}`,
  },
  description: `${publicEnv.NEXT_PUBLIC_APP_NAME} web application`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
            <p className="text-base font-semibold">{publicEnv.NEXT_PUBLIC_APP_NAME}</p>
          </div>
        </header>
        <Providers>
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
