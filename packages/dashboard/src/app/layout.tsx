import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ShellLayout } from "@/components/shell-layout";

export const metadata: Metadata = {
  title: "UI Perf Testing/Analysis",
  description: "UI Performance Testing and Analysis Framework",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <Providers>
          <ShellLayout>{children}</ShellLayout>
        </Providers>
      </body>
    </html>
  );
}
