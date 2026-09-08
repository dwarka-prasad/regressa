import nodemailer from "nodemailer";

let transport: nodemailer.Transporter | null = null;

/** SMTP via SMTP_URL (smtp://user:pass@host:587). Throws a clear error when unconfigured so the event records notify_error. */
export function mailer(): nodemailer.Transporter {
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL not configured - email channel disabled");
  transport ??= nodemailer.createTransport(url);
  return transport;
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }) {
  const from = process.env.SMTP_FROM ?? "Regressa <alerts@regressa.dev>";
  await mailer().sendMail({ from, ...msg });
}
