import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  QUEUE_ALERTS, QUEUE_EVALS, QUEUE_MAINTENANCE, QUEUE_NOTIFY, QUEUE_TRACES,
  type EvaluateAlertsJob, type MaintenanceJob, type NotifyJob, type PersistTracesJob, type RunEvalJob,
} from "@regressa/shared-types";
import { config } from "./config.js";

export const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

const defaults = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export const tracesQueue = new Queue<PersistTracesJob>(QUEUE_TRACES, { connection, defaultJobOptions: defaults });
export const evalsQueue = new Queue<RunEvalJob>(QUEUE_EVALS, { connection, defaultJobOptions: defaults });
export const alertsQueue = new Queue<EvaluateAlertsJob>(QUEUE_ALERTS, { connection, defaultJobOptions: { ...defaults, attempts: 1 } });
export const notifyQueue = new Queue<NotifyJob>(QUEUE_NOTIFY, { connection, defaultJobOptions: { ...defaults, attempts: 5 } });
export const maintenanceQueue = new Queue<MaintenanceJob>(QUEUE_MAINTENANCE, { connection, defaultJobOptions: { ...defaults, attempts: 1 } });
