import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "PayPilot — AI accounts receivable for PayPal invoices",
  description: "An AI agent that chases late PayPal invoices, scores client risk and forecasts cash flow. Every money action needs your approval.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
