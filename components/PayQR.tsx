"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function PayQR({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let on = true;
    QRCode.toDataURL(url, { margin: 1, width: 112 })
      .then((d: string) => { if (on) setSrc(d); })
      .catch(() => {});
    return () => { on = false; };
  }, [url]);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={84} height={84} alt="QR code to pay this invoice" style={{ border: "1px solid #d0d5dd", borderRadius: 4 }} />;
}
