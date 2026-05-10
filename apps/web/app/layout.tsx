import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperLand — 연구 지형도",
  description: "논문 검색기가 아닌 연구 지형도와 공백 후보 탐지기",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
