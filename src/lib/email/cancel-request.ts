import { sendEmail } from "@/lib/email/send";

const ADMIN_CANCEL_EMAIL = "roshan@bartally.in";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCancelRequestIst(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()} IST`;
}

export async function sendCancellationRequestEmails(input: {
  venueName: string;
  venueId: string;
  userEmail: string;
  requestedAtIst: string;
}): Promise<void> {
  const adminText = [
    "Cancellation request",
    "",
    `Venue: ${input.venueName}`,
    `Venue ID: ${input.venueId}`,
    `User email: ${input.userEmail}`,
    `Date and time (IST): ${input.requestedAtIst}`,
  ].join("\n");

  const adminHtml = `
    <h2>Cancellation request</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Venue</td><td>${escapeHtml(input.venueName)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Venue ID</td><td>${escapeHtml(input.venueId)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">User email</td><td>${escapeHtml(input.userEmail)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Date and time (IST)</td><td>${escapeHtml(input.requestedAtIst)}</td></tr>
    </table>
  `.trim();

  const userSubject = `We received your BarTally cancellation request for ${input.venueName}`;
  const userText = [
    `We've received your cancellation request for ${input.venueName}. Your plan stays active until the end of the period you've paid for. We'll confirm the end date by email within 1 working day.`,
  ].join("\n");
  const userHtml = `<p>${escapeHtml(
    `We've received your cancellation request for ${input.venueName}. Your plan stays active until the end of the period you've paid for. We'll confirm the end date by email within 1 working day.`,
  )}</p>`;

  await sendEmail({
    to: ADMIN_CANCEL_EMAIL,
    subject: `Cancellation request: ${input.venueName}`,
    html: adminHtml,
    text: adminText,
  });
  await sendEmail({
    to: input.userEmail,
    subject: userSubject,
    html: userHtml,
    text: userText,
  });
}
