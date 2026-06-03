const express = require("express");
const { google } = require("googleapis");

const app = express();
const SHEET_ID = process.env.SHEET_ID;
const APP_VERSION = process.env.APP_VERSION || "cloud-run";
const allowedOrigins = new Set([
  "https://laddaga.net",
  "https://www.laddaga.net",
  "http://laddaga.net",
  "http://www.laddaga.net",
  "https://rudy-sudo.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
]);

app.use(express.text({ type: ["text/plain", "application/json"], limit: "128kb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

function cleanText(value, max = 5000) {
  return String(value || "").slice(0, max);
}

function cleanJson(value) {
  if (!value || typeof value !== "object") return "{}";
  return JSON.stringify(value).slice(0, 20000);
}

function buildRow(data) {
  const total = Number(data.total || 0);
  const done = Number(data.done || 0);
  return [
    cleanText(data.timestamp || new Date().toISOString(), 64),
    cleanText(data.fecha, 32),
    cleanText(data.dia, 8),
    cleanText(data.mood, 32),
    done,
    total,
    total ? Math.round((done / total) * 100) : 0,
    cleanText(data.notas),
    cleanJson(data.series),
    cleanJson(data.weights),
    cleanJson(data.quickNotes),
    cleanText(data.userAgent, 1000),
    cleanText(data.appVersion || APP_VERSION, 64),
    cleanText(data.deviceId, 80),
    cleanText(data.source || "espalda-feliz-web", 64)
  ];
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "espalda-feliz-logger" });
});

app.post("/", async (req, res) => {
  if (!SHEET_ID) return res.status(500).json({ ok: false, error: "missing_sheet_id" });

  try {
    const body = typeof req.body === "string" ? req.body : "";
    const data = JSON.parse(body || "{}");
    if (!data.fecha || !data.dia) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    const auth = await google.auth.getClient({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({ version: "v4", auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sesiones!A:O",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [buildRow(data)] }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: "append_failed" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`espalda-feliz-logger listening on ${port}`);
});
