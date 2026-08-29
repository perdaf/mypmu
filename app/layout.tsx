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
          <p>Aide à la décision fondée sur les données</p>
        </header>
        {children}
        <footer className="siteFooter">
          Analyse informative uniquement. Les jeux d’argent comportent des risques.
        </footer>
      </body>
    </html>
  );
}
