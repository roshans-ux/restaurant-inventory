export type BetaSignupSheetRow = {
  restaurantName: string;
  location: string;
  email: string;
  phone: string;
  heardAboutUs: string;
  signedUpAt: string;
};

const BETA_SIGNUPS_TAB = "Beta Signups";

async function postToSheetsWebhook(body: unknown): Promise<{ ok: boolean; skipped?: boolean }> {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("GOOGLE_SHEETS_WEBHOOK_URL is not configured");
    }
    console.warn("[google-sheets] GOOGLE_SHEETS_WEBHOOK_URL not set; skipping sheet append");
    return { ok: true, skipped: true };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheet append failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return { ok: true };
}

/** Append a row to the Beta Signups tab — see docs/google-sheets-apps-script.md */
export async function appendBetaSignupRow(row: BetaSignupSheetRow): Promise<{ ok: boolean; skipped?: boolean }> {
  return postToSheetsWebhook({
    action: "appendBetaSignup",
    tab: BETA_SIGNUPS_TAB,
    row: [
      row.restaurantName,
      row.location,
      row.email,
      row.phone,
      row.heardAboutUs,
      row.signedUpAt,
      "",
    ],
  });
}

/** Set Approved column to Yes for the matching email (column C). */
export async function markBetaSignupApproved(email: string): Promise<{ ok: boolean; skipped?: boolean }> {
  return postToSheetsWebhook({
    action: "approveBetaSignup",
    tab: BETA_SIGNUPS_TAB,
    email: email.toLowerCase().trim(),
    approved: "Yes",
  });
}
