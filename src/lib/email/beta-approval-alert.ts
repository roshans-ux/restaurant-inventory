import { getAppBaseUrl } from "@/lib/email/app-url";
import type { NextRequest } from "next/server";
import { sendEmail } from "@/lib/email/send";

export type BetaSignupAlertDetails = {
  restaurantName: string;
  location: string;
  email: string;
  phone: string;
  heardAboutUs: string;
  signedUpAtIst: string;
};

export function getAdminAlertEmail(): string {
  return process.env.ADMIN_ALERT_EMAIL?.trim() ?? "roshan.s@brucira.com";
}

export function buildApprovalUrl(request: NextRequest, rawToken: string): string {
  return `${getAppBaseUrl(request)}/api/admin/approve?token=${encodeURIComponent(rawToken)}`;
}

export async function sendBetaSignupAlertEmail(
  request: NextRequest,
  details: BetaSignupAlertDetails,
  rawApprovalToken: string,
) {
  const approveUrl = buildApprovalUrl(request, rawApprovalToken);
  const to = getAdminAlertEmail();

  const subject = `Beta signup: ${details.restaurantName}`;
  const text = [
    "New beta signup — approve to activate their account.",
    "",
    `Restaurant: ${details.restaurantName}`,
    `Location: ${details.location}`,
    `Email: ${details.email}`,
    `Phone: ${details.phone}`,
    `How they heard about us: ${details.heardAboutUs}`,
    `Signed up at (IST): ${details.signedUpAtIst}`,
    "",
    `Approve: ${approveUrl}`,
  ].join("\n");

  const html = `
    <h2>New beta signup</h2>
    <p>Approve to set <code>emailVerifiedAt</code> on their account (they can then use the app).</p>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Restaurant</td><td>${escapeHtml(details.restaurantName)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Location</td><td>${escapeHtml(details.location)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Email</td><td>${escapeHtml(details.email)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Phone</td><td>${escapeHtml(details.phone)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Heard about us</td><td>${escapeHtml(details.heardAboutUs)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Signed up at (IST)</td><td>${escapeHtml(details.signedUpAtIst)}</td></tr>
    </table>
    <p style="margin-top:24px;">
      <a href="${approveUrl}" style="display:inline-block;background:#c9a227;color:#0e0e11;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
        Approve this account
      </a>
    </p>
    <p style="font-size:12px;color:#666;">Link expires in 7 days. You can still approve via Neon SQL if needed.</p>
  `.trim();

  await sendEmail({ to, subject, html, text });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
