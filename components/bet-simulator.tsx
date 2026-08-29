"use client";

import { useMemo, useState } from "react";
import type { AvailableBet, Participant } from "@/lib/pmu";
import { allowedFlexis, betLabel, betRole, calculateTicket, selectionRange } from "@/lib/bets";
import type { RaceRecommendation } from "@/lib/analysis";

const SUPPORTED_BETS = new Set([
  "SIMPLE_GAGNANT", "SIMPLE_PLACE", "COUPLE_GAGNANT", "COUPLE_PLACE",
  "DEUX_SUR_QUATRE", "TRIO", "TIERCE", "QUARTE_PLUS", "QUINTE_PLUS",
  "MINI_MULTI", "MULTI",
]);

type Runner = Pick<Participant, "numPmu" | "nom">;
type Ticket = { id: string; betCode: string; horses: Runner[]; flexi: number; costCents: number; combinations: number; role: string; explanation?: string };

function euros(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function flexiLabel(flexi: number) {
  return flexi === 100 ? "Sans Flexi" : `Flexi ${flexi} %`;
}

function betTitle(code: string, horseCount: number) {
  return ["MULTI", "MINI_MULTI"].includes(code) ? `${betLabel(code)} en ${horseCount}` : betLabel(code);
}

function betsForRole(role: string, bets: AvailableBet[]) {
  const codes = role === "Sécurité"
    ? ["DEUX_SUR_QUATRE", "COUPLE_PLACE", "SIMPLE_PLACE"]
    : role === "Couverture"
      ? ["MULTI", "MINI_MULTI", "TRIO"]
      : ["QUINTE_PLUS", "QUARTE_PLUS", "TIERCE"];
  return codes.flatMap((code) => {
    const bet = bets.find((item) => item.typePari === code);
    return bet ? [bet] : [];
  });
}

function EditableRecommendedGame({ ticket, bets, participants, onChange }: { ticket: Ticket; bets: AvailableBet[]; participants: Runner[]; onChange: (ticket: Ticket) => void }) {
  const options = betsForRole(ticket.role, bets);
  const [betCode, setBetCode] = useState(ticket.betCode);
  const [numbers, setNumbers] = useState(ticket.horses.map((horse) => horse.numPmu));
  const [flexi, setFlexi] = useState(ticket.flexi);
  const bet = options.find((option) => option.typePari === betCode) ?? options[0];
  if (!bet) return null;

  const counts = selectionRange(bet, participants.length);
  const flexis = allowedFlexis(bet);
  const valid = counts.includes(numbers.length) && flexis.includes(flexi);
  const calculation = valid ? calculateTicket(bet, numbers.length, flexi) : null;

  function synchronize(nextBet: AvailableBet, nextNumbers: number[], nextFlexi: number) {
    const nextCounts = selectionRange(nextBet, participants.length);
    if (!nextCounts.includes(nextNumbers.length) || !allowedFlexis(nextBet).includes(nextFlexi)) return;
    const result = calculateTicket(nextBet, nextNumbers.length, nextFlexi);
    onChange({
      ...ticket,
      betCode: nextBet.typePari,
      horses: nextNumbers.flatMap((number) => {
        const horse = participants.find((participant) => participant.numPmu === number);
        return horse ? [horse] : [];
      }),
      flexi: nextFlexi,
      costCents: result.costCents,
      combinations: result.combinations,
    });
  }

  function changeBet(code: string) {
    const nextBet = options.find((option) => option.typePari === code);
    if (!nextBet) return;
    const nextCounts = selectionRange(nextBet, participants.length);
    const target = nextCounts.includes(numbers.length) ? numbers.length : nextCounts[0];
    const nextNumbers = [...numbers, ...participants.map((horse) => horse.numPmu).filter((number) => !numbers.includes(number))].slice(0, target);
    const nextFlexis = allowedFlexis(nextBet);
    const nextFlexi = nextFlexis.includes(flexi) ? flexi : nextFlexis.at(-1) ?? 100;
    setBetCode(code);
    setNumbers(nextNumbers);
    setFlexi(nextFlexi);
    synchronize(nextBet, nextNumbers, nextFlexi);
  }

  function toggleHorse(number: number) {
    const next = numbers.includes(number) ? numbers.filter((item) => item !== number) : [...numbers, number];
    setNumbers(next);
    synchronize(bet, next, flexi);
  }

  function changeFlexi(value: number) {
    setFlexi(value);
    synchronize(bet, numbers, value);
  }

  return (
    <article className="recommendedGame">
      <span className="recommendedRole">{ticket.role}</span>
      <h4>{betTitle(ticket.betCode, ticket.horses.length)}</h4>
      <p>{ticket.horses.map((horse) => horse.numPmu).join(" - ")}</p>
      <small>{flexiLabel(ticket.flexi)} · {ticket.combinations} combinaison{ticket.combinations > 1 ? "s" : ""}</small>
      <strong>{euros(ticket.costCents)}</strong>
      {ticket.explanation && <em>{ticket.explanation}</em>}

      <details className="recommendedEditor">
        <summary>Modifier ce jeu</summary>
        <div className="recommendedEditorBody">
          <div className="recommendedFields">
            <label>Formule<select value={bet.typePari} onChange={(event) => changeBet(event.target.value)}>{options.map((option) => <option value={option.typePari} key={option.typePari}>{betLabel(option.typePari)}</option>)}</select></label>
            <label>Mise<select value={flexi} onChange={(event) => changeFlexi(Number(event.target.value))}>{flexis.map((value) => <option value={value} key={value}>{flexiLabel(value)}</option>)}</select></label>
          </div>
          <div className="compactHorseChoices">
            {participants.map((horse) => {
              const position = numbers.indexOf(horse.numPmu);
              return <button type="button" className={position >= 0 ? "compactHorse selected" : "compactHorse"} onClick={() => toggleHorse(horse.numPmu)} title={horse.nom} key={horse.numPmu}><span>{horse.numPmu}</span>{position >= 0 && <em>{position + 1}</em>}</button>;
            })}
          </div>
          <div className="editorCost"><span>{numbers.length} cheval{numbers.length > 1 ? "aux" : ""} · valeurs acceptées : {counts.join(", ")}</span><strong>{calculation ? euros(calculation.costCents) : "Sélection incomplète"}</strong></div>
        </div>
      </details>
    </article>
  );
}

export function BetSimulator({ bets, participants, reunion, course, recommendation }: { bets: AvailableBet[]; participants: Runner[]; reunion: number; course: number; recommendation: RaceRecommendation }) {
  const supported = useMemo(() => bets.filter((bet) => SUPPORTED_BETS.has(bet.typePari)), [bets]);
  const [betCode, setBetCode] = useState(supported[0]?.typePari ?? "");
  const activeBet = supported.find((bet) => bet.typePari === betCode) ?? supported[0];
  const flexis = activeBet ? allowedFlexis(activeBet) : [100];
  const [flexi, setFlexi] = useState(100);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>(() => recommendation.tickets.map((proposal) => ({
    id: proposal.id,
    betCode: proposal.betCode,
    horses: proposal.horseNumbers.flatMap((number) => {
      const horse = participants.find((participant) => participant.numPmu === number);
      return horse ? [horse] : [];
    }),
    flexi: proposal.flexi,
    costCents: proposal.costCents,
    combinations: proposal.combinations,
    role: proposal.role,
    explanation: proposal.explanation,
  })));

  if (!activeBet) return null;

  const allowedSelections = selectionRange(activeBet, participants.length);
  const selectionIsValid = allowedSelections.includes(selectedNumbers.length);
  const effectiveFlexi = flexis.includes(flexi) ? flexi : 100;
  const calculation = selectionIsValid ? calculateTicket(activeBet, selectedNumbers.length, effectiveFlexi) : null;

  function changeBet(code: string) {
    const bet = supported.find((item) => item.typePari === code);
    setBetCode(code);
    setSelectedNumbers([]);
    setFlexi(bet && allowedFlexis(bet).includes(25) ? 25 : 100);
  }

  function toggleHorse(number: number) {
    setSelectedNumbers((current) => current.includes(number) ? current.filter((item) => item !== number) : [...current, number]);
  }

  function addTicket() {
    if (!calculation) return;
    const horses = selectedNumbers.map((number) => {
      const participant = participants.find((item) => item.numPmu === number);
      if (!participant) throw new Error("Cheval introuvable");
      return participant;
    });
    setTickets((current) => [...current, {
      id: crypto.randomUUID(), betCode: activeBet.typePari, horses,
      flexi: calculation.flexi, costCents: calculation.costCents, combinations: calculation.combinations,
      role: "Jeu manuel",
    }]);
    setSelectedNumbers([]);
  }

  const totalCents = tickets.reduce((total, ticket) => total + ticket.costCents, 0);
  const recommendedTickets = tickets.filter((ticket) => ticket.role !== "Jeu manuel");
  const recommendedTotalCents = recommendedTickets.reduce((total, ticket) => total + ticket.costCents, 0);
  const courseBettingOpen = supported.some((bet) => bet.enVente);
  const minSelections = allowedSelections[0] ?? activeBet.nbChevauxReglementaire;
  const maxSelections = allowedSelections.at(-1) ?? minSelections;

  return (
    <section className="betSection">
      <div className="sectionHeading"><div><p className="eyebrow">Analyse de la course</p><h2>Proposition automatique</h2></div><p>Score expérimental · R{reunion} C{course}</p></div>
      <div className="analysisNotice"><strong>Le moteur combine consensus presse, cote, musique, carrière et avis entraîneur.</strong> Ce score est explicable mais pas encore calibré par backtest : il classe des profils, il ne garantit pas un gain.</div>
      <div className={recommendation.dataQuality.recommendationAllowed ? "qualityIndicator qualityGood" : "qualityIndicator qualityInsufficient"}>
        <strong>Qualité des données : {recommendation.dataQuality.completenessPercent} %</strong>
        <span>{recommendation.dataQuality.recommendationAllowed ? `${recommendation.dataQuality.lowConfidenceHorses} partant(s) à faible confiance — recommandation autorisée` : recommendation.dataQuality.warning}</span>
      </div>
      <div className="analysisGrid">
        {recommendation.ranking.slice(0, 8).map((horse, index) => (
          <article className={horse.profile === "Outsider de valeur" ? "analysisHorse outsider" : "analysisHorse"} key={horse.numPmu}>
            <span className="analysisRank">{index + 1}</span>
            <span className="analysisNumber">{horse.numPmu}</span>
            <div><strong>{horse.nom}</strong><small>{horse.profile} · cote {horse.cote ?? "—"} · confiance {horse.confidence}</small><p>{horse.reasons.join(" · ")}</p>{horse.missingData.length > 0 && <p className="missingData">Données manquantes : {horse.missingData.join(", ")}</p>}</div>
            <span className="analysisScore">{horse.score}<small>/100</small></span>
          </article>
        ))}
      </div>
      {recommendation.commentary && <details className="raceCommentary"><summary>Lire l’analyse éditoriale PMU</summary><p>{recommendation.commentary}</p></details>}

      <section className="recommendedPortfolio">
        <header><div><p className="eyebrow">Sélection prête à jouer</p><h3>Jeux conseillés</h3></div><div><small>Budget conseillé</small><strong>{euros(recommendedTotalCents)}</strong></div></header>
        {recommendedTickets.length === 0 ? <p className="emptyRecommendation">Aucune formule compatible n’est proposée sur cette course.</p> : (
          <div className="recommendedGames">
            {recommendedTickets.map((ticket) => <EditableRecommendedGame
              ticket={ticket}
              bets={bets}
              participants={participants}
              onChange={(updated) => setTickets((current) => current.map((item) => item.id === updated.id ? updated : item))}
              key={`recommended-${ticket.id}`}
            />)}
          </div>
        )}
        <footer><strong>À vérifier avant de jouer :</strong> non-partants, ouverture du pari et montant affiché par le terminal PMU.</footer>
      </section>

      {!courseBettingOpen && <div className="bettingClosedAlert" role="alert"><strong>Paris fermés pour cette course</strong><span>La sélection reste visible pour l’analyse, mais elle ne peut plus être enregistrée au PMU.</span></div>}

      <details className="manualBuilder">
        <summary><span>Ajouter mon propre jeu</span><small>Constructeur de ticket · facultatif</small></summary>
        <div className="manualBuilderContent">
      <div className="sectionHeading builderHeading"><div><p className="eyebrow">Jeu libre</p><h2>Constructeur de ticket</h2></div><p>Ajouter une formule différente</p></div>
      <div className="warningBox"><strong>Préparation uniquement :</strong> vérifiez toujours les numéros, les non-partants et le montant sur le terminal PMU avant validation.</div>

      <div className="ticketBuilder">
        {!activeBet.enVente && <div className="formulaClosedAlert" role="status"><strong>{betLabel(activeBet.typePari)} : paris fermés</strong><span>Tu peux simuler ou préparer ce jeu, mais pas l’enregistrer actuellement.</span></div>}
        <div className="builderControls">
          <label>Type de jeu<select value={activeBet.typePari} onChange={(event) => changeBet(event.target.value)}>{supported.map((bet) => <option value={bet.typePari} key={bet.typePari}>{betLabel(bet.typePari)}</option>)}</select></label>
          <label>Type de mise<select value={effectiveFlexi} onChange={(event) => setFlexi(Number(event.target.value))}>{flexis.map((value) => <option value={value} key={value}>{flexiLabel(value)}</option>)}</select></label>
          <div className="selectedGame"><span className={`role role${betRole(activeBet.typePari)}`}>{betRole(activeBet.typePari)}</span><strong>{betLabel(activeBet.typePari)}</strong><small>{activeBet.enVente ? "Ouvert à la vente" : "Vente fermée"}</small></div>
        </div>

        <div className="horsePicker">
          <div className="pickerHeading"><div><strong>Sélectionnez {minSelections}{maxSelections !== minSelections ? ` à ${maxSelections}` : ""} cheval{maxSelections > 1 ? "aux" : ""}</strong><small>Cliquer dans l’ordre souhaité pour les jeux avec ordre.</small></div><span>{selectedNumbers.length} sélectionné{selectedNumbers.length > 1 ? "s" : ""}</span></div>
          <div className="horseChoices">
            {participants.map((participant) => {
              const position = selectedNumbers.indexOf(participant.numPmu);
              return <button type="button" className={position >= 0 ? "horseChoice selected" : "horseChoice"} onClick={() => toggleHorse(participant.numPmu)} key={participant.numPmu}><span>{participant.numPmu}</span><strong>{participant.nom}</strong>{position >= 0 && <em>{position + 1}</em>}</button>;
            })}
          </div>
        </div>

        <div className="liveCalculation" aria-live="polite">
          <div><small>Combinaisons</small><strong>{calculation?.combinations ?? "—"}</strong></div>
          <div><small>Scénarios couverts</small><strong>{calculation?.coveredOutcomes ?? "—"}</strong></div>
          <div className="liveCost"><small>Coût de ce jeu</small><strong>{calculation ? euros(calculation.costCents) : "—"}</strong></div>
          <button type="button" disabled={!calculation} onClick={addTicket}>Ajouter au récapitulatif</button>
        </div>
        {!selectionIsValid && selectedNumbers.length > 0 && <p className="selectionHint">Cette formule accepte {allowedSelections.join(", ")} cheval{maxSelections > 1 ? "aux" : ""}.</p>}
      </div>
        </div>
      </details>

      <section className="ticketSummary">
        <header><div><p className="eyebrow">À reporter sur le ticket PMU</p><h3>Récapitulatif de mes jeux</h3></div><strong>{euros(totalCents)}</strong></header>
        {tickets.length === 0 ? <p className="emptyTicket">Aucun jeu ajouté pour le moment.</p> : (
          <div className="ticketLines">{tickets.map((ticket, index) => (
            <article key={ticket.id}>
              <span className="ticketIndex">{index + 1}</span>
              <div className="ticketMain"><strong>{ticket.role} · R{reunion} C{course} · {betLabel(ticket.betCode)}</strong><span>Chevaux : {ticket.horses.map((horse) => horse.numPmu).join(" - ")}</span><small>{ticket.horses.map((horse) => `${horse.numPmu}. ${horse.nom}`).join(" · ")}</small>{ticket.explanation && <small className="ticketExplanation">{ticket.explanation}</small>}</div>
              <div className="ticketStake"><span>{flexiLabel(ticket.flexi)}</span><small>{ticket.combinations} combinaison{ticket.combinations > 1 ? "s" : ""}</small><strong>{euros(ticket.costCents)}</strong></div>
              <button type="button" className="removeTicket" onClick={() => setTickets((current) => current.filter((item) => item.id !== ticket.id))} aria-label={`Supprimer le jeu ${index + 1}`}>×</button>
            </article>
          ))}</div>
        )}
        <footer><span>{tickets.length} jeu{tickets.length > 1 ? "x" : ""}</span><strong>Total : {euros(totalCents)}</strong></footer>
      </section>
    </section>
  );
}
