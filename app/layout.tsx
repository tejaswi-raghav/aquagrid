import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ScenarioController } from "@/components/ScenarioController";
import "./globals.css";

const archivo = localFont({
  src: [
    { path: "../node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2", style: "normal" },
    { path: "../node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-italic.woff2", style: "italic" },
  ],
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const metadata: Metadata = {
  title: "AquaGrid — The city beneath the city",
  description:
    "An interactive digital twin of a Gulf coastal water system: intake, desalination, storage and distribution, and what happens when four disruptions arrive at once.",
};

export const viewport: Viewport = { themeColor: "#00b4d8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>
        <ScenarioController>{children}</ScenarioController>
      </body>
    </html>
  );
}
