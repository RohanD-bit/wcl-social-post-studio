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

function sheetRange(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'!A:ZZ`;
}

async function readGoogleError(response, fallback) {
  const details = await response.json().catch(() => null);
  return details?.error?.message || fallback;
}

export function valuesToRecords(values) {
  const rows = Array.isArray(values) ? values : [];
  const headers = rows.shift() || [];
  return rows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

export async function listSpreadsheetTabs(accessToken, spreadsheetId) {
  if (!accessToken || !spreadsheetId) {
    throw new Error("Choose a spreadsheet first.");
  }

  const params = new URLSearchParams({
    fields: "properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))",
  });
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await readGoogleError(response, `Google Sheets returned ${response.status}.`);
    if (response.status === 401) {
      const error = new Error("Google session expired. Reconnect Google Sheet to choose a tab.");
      error.code = "auth_expired";
      throw error;
    }
    throw new Error(message);
  }

  const payload = await response.json();
  return {
    title: payload.properties?.title ?? "Untitled spreadsheet",
    tabs: (payload.sheets ?? [])
      .map((sheet) => sheet.properties)
      .filter(Boolean)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
  };
}

export async function loadGoogleSheetWithToken(accessToken, options = {}) {
  if (!accessToken) {
    throw new Error("Connect Google Sheet first.");
  }

  const spreadsheetId = options.spreadsheetId || SHEET_ID;
  const sheetName = options.sheetName || SHEET_NAME;
  const range = encodeURIComponent(sheetRange(sheetName));
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await readGoogleError(response, `Google Sheets returned ${response.status}.`);
    if (response.status === 401) {
      const error = new Error("Google session expired. Reconnect the sheet to refresh data.");
      error.code = "auth_expired";
      throw error;
    }
    if (response.status === 403) {
      throw new Error(message || "This Google account cannot read that response sheet.");
    }
    throw new Error(message || `Google Sheets returned ${response.status}.`);
  }

  const payload = await response.json();
  return mapRecordsToSubmissions(valuesToRecords(payload.values));
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
