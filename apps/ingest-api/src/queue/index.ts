import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_TRACES, type PersistTracesJob } from "@regressa/shared-types";
import { config } from "../config.js";

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export const tracesQueue = new Queue<PersistTracesJob>(QUEUE_TRACES, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 3600, count: 10_000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});
