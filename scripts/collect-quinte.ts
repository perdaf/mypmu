import { currentPmuDate, runCollector } from "./collector-runner";

runCollector(currentPmuDate(), false, { quinteOnly: true }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
