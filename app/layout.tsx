import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brazil Soy Deforestation & Conversion Exposure",
  description:
    "Interactive 2024 dashboard of soy-linked deforestation and conversion exposure across Brazilian municipalities, states and predominant biomes.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
