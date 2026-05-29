# Google Sheets webhook (Beta Signups + Waitlist)

Your Apps Script web app should handle two payload shapes on the same `GOOGLE_SHEETS_WEBHOOK_URL`.

## Sheet tabs

1. **Waitlist** — existing tab (keep your current handler for waitlist payloads).
2. **Beta Signups** — add tab with headers:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Restaurant name | Location | Email | Phone number | How they heard about us | Signed up at | Approved |

## Apps Script example

```javascript
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (body.tab === "Beta Signups" && Array.isArray(body.row)) {
    const sheet = ss.getSheetByName("Beta Signups");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Missing Beta Signups tab" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    sheet.appendRow(body.row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  // Legacy onboarding / waitlist shape
  if (body.email && body.restaurantName) {
    const waitlist = ss.getSheetByName("Waitlist");
    if (waitlist) {
      waitlist.appendRow([
        body.email,
        body.restaurantName,
        body.location,
        body.heardAboutUs,
        body.signedUpAt,
      ]);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Unknown payload" }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Deploy as **Web app** → **Execute as: Me** → **Who has access: Anyone**. Use the `/exec` URL as `GOOGLE_SHEETS_WEBHOOK_URL`.

After approving in email, manually set column **G (Approved)** to `yes` or the date if you track it in the sheet.
