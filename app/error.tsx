"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main><section className="errorCard"><p className="eyebrow">Données indisponibles</p><h1>Impossible de charger ce programme.</h1><p>L’API PMU est peut-être momentanément indisponible ou son format a changé.</p><button onClick={reset}>Réessayer</button></section></main>
  );
}
