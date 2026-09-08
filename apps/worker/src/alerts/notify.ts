import { createHmac } from "node:crypto";
import { Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { schema, type RegressaDb } from "@regressa/db";
import { QUEUE_NOTIFY, type NotifyJob } from "@regressa/shared-types";
import { connection } from "../queues.js";
import { config } from "../config.js";
import { sendEmail } from "./email.js";

export function startNotifyWorker(db: RegressaDb) {
  return new Worker<NotifyJob>(QUEUE_NOTIFY, async (job) => {
    const [row] = await db.select({
      event: schema.alertEvents, rule: schema.alertRules, project: schema.projects,
    }).from(schema.alertEvents)
      .innerJoin(schema.alertRules, eq(schema.alertRules.id, schema.alertEvents.alertRuleId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.alertEvents.projectId))
      .where(eq(schema.alertEvents.id, job.data.alertEventId)).limit(1);
    if (!row) return;
    const { event, rule, project } = row;
    const cfg = rule.channelConfig as Record<string, string>;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
    const link = `${appUrl}/alerts/${event.id}`;
    const title = `Regressa alert: ${rule.name}`;

    try {
      switch (rule.channel) {
        case "slack":
          await post(cfg.webhook_url!, {
            text: `${title}: ${event.message}`,
            blocks: [
              { type: "header", text: { type: "plain_text", text: title } },
              { type: "section", text: { type: "mrkdwn", text: `*Project:* ${project.name}` } },
              { type: "section", text: { type: "mrkdwn", text: event.message } },
              { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Regressa" }, url: link }] },
            ],
          });
          break;
        case "webhook":
          await post(cfg.url!, {
            type: "regressa.alert.triggered",
            alert_event_id: event.id,
            rule: { id: rule.id, name: rule.name, metric: rule.metric, condition: rule.condition, threshold: rule.threshold },
            project: { id: project.id, name: project.name },
            triggered_value: event.triggeredValue, baseline_value: event.baselineValue,
            message: event.message, url: link, created_at: event.createdAt,
          }, cfg.secret);
          break;
        case "email":
          await sendEmail({ to: cfg.to!, subject: title, text: `${event.message}\n\nProject: ${project.name}\nOpen in Regressa: ${link}`,
            html: `<p>${escapeHtml(event.message)}</p><p>Project: ${escapeHtml(project.name)}</p><p><a href="${link}">Open in Regressa</a></p>` });
          break;
        default:
          throw new Error(`unknown channel ${rule.channel}`);
      }
      await db.update(schema.alertEvents).set({ notifiedAt: sql`now()`, notifyError: null }).where(eq(schema.alertEvents.id, event.id));
    } catch (err) {
      await db.update(schema.alertEvents).set({ notifyError: String(err) }).where(eq(schema.alertEvents.id, event.id));
      throw err;
    }
  }, { connection, concurrency: config.concurrency.notify });
}

async function post(url: string, body: unknown, secret?: string) {
  if (!url) throw new Error("channel_config missing url");
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "regressa-alerts/0.1" };
  if (secret) headers["X-Regressa-Signature"] = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  const res = await fetch(url, { method: "POST", headers, body: payload });
  if (!res.ok) throw new Error(`notify ${url} -> ${res.status}`);
}

function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!); }
