# Google Sheets webhook (Beta Signups only)

Use a single spreadsheet with one tab: **Beta Signups**. Delete the old **Waitlist** tab if you no longer need it.

## Tab headers (row 1)

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Restaurant name | Location | Email | Phone number | How they heard about us | Signed up at | Approved |

## Apps Script (replace your entire `doPost`)

```javascript
const BETA_TAB = "Beta Signups";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BETA_TAB);

  if (!sheet) {
    return json({ ok: false, error: "Missing Beta Signups tab" });
  }

  if (body.action === "approveBetaSignup" && body.email) {
    const target = String(body.email).toLowerCase().trim();
    const data = sheet.getDataRange().getValues();
    let updated = false;
    for (let i = 1; i < data.length; i++) {
      const rowEmail = String(data[i][2] || "").toLowerCase().trim();
      if (rowEmail === target) {
        sheet.getRange(i + 1, 7).setValue(body.approved || "Yes");
        updated = true;
        break;
      }
    }
    return json({ ok: true, updated });
  }

  if (body.action === "appendBetaSignup" && Array.isArray(body.row)) {
    sheet.appendRow(body.row);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 6).setNumberFormat("@");
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown action" });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
```

## Deploy

1. Paste the script above into your **Signup Webhook** project.
2. **Deploy** → **Manage deployments** → **Edit** → **New version** → **Deploy** (same `/exec` URL).
3. Keep that URL in Vercel as `GOOGLE_SHEETS_WEBHOOK_URL`.

When you click **Approve this account** in the alert email, column **G** updates to **Yes** automatically.
