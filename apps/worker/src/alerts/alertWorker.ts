import { Worker } from "bullmq";
import type { RegressaDb } from "@regressa/db";
import { QUEUE_ALERTS, type EvaluateAlertsJob } from "@regressa/shared-types";
import { alertsQueue, connection } from "../queues.js";
import { config } from "../config.js";
import { evaluateAlertRules } from "./evaluate.js";

export async function startAlertWorker(db: RegressaDb) {
  // Repeatable job: evaluate all rules every N ms. Keyed by scheduler id so multiple replicas don't double-schedule.
  await alertsQueue.upsertJobScheduler("evaluate-all", { every: config.alertEvalIntervalMs }, { name: "evaluate", data: {} });

  return new Worker<EvaluateAlertsJob>(QUEUE_ALERTS, async (job) => {
    const fired = await evaluateAlertRules(db, job.data.projectId);
    if (fired) console.log(`[alerts] fired ${fired} alert(s)`);
    return { fired };
  }, { connection, concurrency: config.concurrency.alerts });
}
