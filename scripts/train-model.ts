import { initializeDatabase } from "../lib/db";
import { trainAndPromoteModel } from "../lib/model-training";

const database = initializeDatabase();
try {
  const result = trainAndPromoteModel(database, { onlyIfNeeded: process.argv.includes("--if-needed") });
  if (result.status === "not_needed") {
    console.log(`Réentraînement non nécessaire : ${result.newRaces}/${20} nouvelles courses.`);
  } else if (result.status === "insufficient") {
    console.log(`Entraînement reporté : ${result.raceCount} courses terminées disponibles.`);
  } else {
    console.log(`${result.status === "active" ? "Modèle promu" : "Candidat non promu"} : ${result.version}`);
    console.log(result.notes);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  database.prepare(`
    INSERT INTO model_training_state (id, last_attempt_at, status, error_message) VALUES (1, ?, 'failed', ?)
    ON CONFLICT(id) DO UPDATE SET status='failed', error_message=excluded.error_message
  `).run(new Date().toISOString(), message);
  console.error("Échec de l’entraînement :", message);
  process.exitCode = 1;
} finally {
  database.close();
}
