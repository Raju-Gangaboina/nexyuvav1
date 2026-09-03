import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexYuva – PM Internship Scheme | AI-Powered Internship Platform",
  description: "NexYuva is India's premier AI-powered internship platform under the PM Internship Scheme. Intelligent skill matching, career guidance, and limitless possibilities for India's youth.",
  keywords: "internship, AI recommendation, PM Internship Scheme, skill matching, career development, government internship, India",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="animated-bg">
        {children}
      </body>
    </html>
  );
}
