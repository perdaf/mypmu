import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MyPMU Analytique", template: "%s · MyPMU" },
  description: "Outil d’analyse factuelle des courses hippiques.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <header className="siteHeader">
          <Link href="/" className="brand">MyPMU <span>Analytique</span></Link>
          <nav aria-label="Navigation principale">
            <Link href="/">Courses</Link>
            <Link href="/historique">Historique & IA</Link>
          </nav>
        </header>
        {children}
        <footer className="siteFooter">
          Analyse informative uniquement. Les jeux d’argent comportent des risques.
        </footer>
      </body>
    </html>
  );
}
