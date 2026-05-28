export type OnboardingSheetRow = {
  email: string;
  restaurantName: string;
  location: string;
  heardAboutUs: string;
  signedUpAt: string;
};

export async function appendOnboardingRow(row: OnboardingSheetRow): Promise<{ ok: boolean; skipped?: boolean }> {
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
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheet append failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return { ok: true };
}
