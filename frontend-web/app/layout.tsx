import type { Metadata } from "next";
import "./globals.css";
import { UIModeProvider } from "./components/UIMode";

export const metadata: Metadata = {
  title: "NexYuva – PM Internship Scheme | AI-Powered Internship Platform",
  description: "NexYuva is India's premier AI-powered internship platform under the PM Internship Scheme. Intelligent skill matching, career guidance, and limitless possibilities for India's youth.",
  keywords: "internship, AI recommendation, PM Internship Scheme, skill matching, career development, government internship, India",
};

// Runs before React hydrates / before first paint, so switching
// Arcade <-> Classic never flashes the wrong theme on reload.
const SET_UI_MODE_SCRIPT = `
(function () {
  try {
    var m = window.localStorage.getItem('nexyuva-ui-mode');
    document.documentElement.setAttribute('data-ui', m === 'classic' ? 'classic' : 'arcade');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme="light" data-ui="arcade" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: SET_UI_MODE_SCRIPT }} />
      </head>
      <body className="animated-bg">
        <UIModeProvider>{children}</UIModeProvider>
      </body>
    </html>
  );
}
