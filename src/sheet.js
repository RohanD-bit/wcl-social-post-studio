import { SHEET_ID, SHEET_NAME } from "./data.js";
import { recordToSubmission } from "./stats.js";

export function parseGoogleTable(table) {
  const labels = table.cols.map((column, index) => column.label || column.id || `Column ${index + 1}`);
  return table.rows.map((row) => {
    const record = {};
    labels.forEach((label, index) => {
      const cell = row.c[index];
      record[label] = cell ? (cell.f ?? cell.v ?? "") : "";
    });
    return record;
  });
}

export function mapRecordsToSubmissions(records) {
  return records
    .map(recordToSubmission)
    .filter((submission) => submission.player || submission.gameDate || submission.performanceDetails);
}

export function loadGoogleSheet() {
  return new Promise((resolve, reject) => {
    const callbackName = `wclSheetCallback_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet load timed out."));
    }, 12000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (response) => {
      cleanup();
      if (response?.status === "error") {
        reject(new Error("Google returned an error. Check the sheet sharing settings."));
        return;
      }
      resolve(mapRecordsToSubmissions(parseGoogleTable(response.table)));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("The browser could not load the Google Sheet."));
    };

    const tqx = encodeURIComponent(`out:json;responseHandler:${callbackName}`);
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=${tqx}&sheet=${encodeURIComponent(SHEET_NAME)}`;
    document.body.appendChild(script);
  });
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function csvToSubmissions(text) {
  const rows = parseCsv(String(text ?? ""));
  const headers = rows.shift() || [];
  const records = rows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
  return mapRecordsToSubmissions(records);
}
