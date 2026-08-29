import { databasePath, initializeDatabase } from "../lib/db";

const database = initializeDatabase();
database.close();
console.log(`Base MyPMU initialisée : ${databasePath()}`);
