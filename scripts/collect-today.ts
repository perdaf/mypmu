import { currentPmuDate, runCollector } from "./collector-runner";

runCollector(currentPmuDate()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
