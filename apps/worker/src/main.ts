import { createDb } from "@regressa/db";
import { config } from "./config.js";
import { startTracesWorker } from "./persist/tracesWorker.js";
import { startEvalWorker } from "./evals/evalWorker.js";
import { startAlertWorker } from "./alerts/alertWorker.js";
import { startNotifyWorker } from "./alerts/notify.js";
import { startMaintenanceWorker } from "./maintenance/maintenanceWorker.js";
import { connection } from "./queues.js";

async function main() {
  const { db, close } = createDb(config.databaseUrl, 10);
  const workers = [startTracesWorker(db), startEvalWorker(db), await startAlertWorker(db), startNotifyWorker(db), await startMaintenanceWorker(db)];
  for (const w of workers) {
    w.on("failed", (job, err) => console.error(`[worker:${w.name}] job ${job?.id} failed:`, err.message));
    w.on("error", (err) => console.error(`[worker:${w.name}] error:`, err));
  }
  console.log(`regressa worker up - queues: ${workers.map((w) => w.name).join(", ")}`);

  const stop = async () => {
    console.log("shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    await close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => { console.error(err); process.exit(1); });
