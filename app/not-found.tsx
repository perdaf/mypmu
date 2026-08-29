import Link from "next/link";

export default function NotFound() {
  return <main><section className="errorCard"><p className="eyebrow">404</p><h1>Course introuvable</h1><p>Vérifiez la date, la réunion et le numéro de course.</p><Link href="/" className="primaryButton">Revenir à l’accueil</Link></section></main>;
}
