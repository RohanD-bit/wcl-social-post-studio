const WCL_BASE_URL = "https://www.wclinc.com";
const WCL_MATCH_LIST_URL = `${WCL_BASE_URL}/wclinc/listMatches.do?league=0&clubId=670`;

const FIELD_LABELS = {
  "batting.runs": "Batting runs",
  "batting.balls": "Balls faced",
  "batting.fours": "Fours",
  "batting.sixes": "Sixes",
  "batting.strikeRate": "Strike rate",
  "bowling.overs": "Bowling overs",
  "bowling.runs": "Runs given",
  "bowling.wickets": "Wickets",
};

class WclFetchError extends Error {
  constructor(statusCode, url) {
    super(`WCL blocked the app from reading ${url}.`);
    this.name = "WclFetchError";
    this.code = statusCode === 403 ? "WCL_FORBIDDEN" : "WCL_FETCH_FAILED";
    this.statusCode = statusCode;
    this.url = url;
  }
}

export function formatValidationError(error) {
  if (error?.code === "WCL_FORBIDDEN") {
    return {
      status: "blocked",
      summary:
        "WCL blocked the automatic scorecard lookup. Open WCL matches, copy the exact scorecard link into Scorecard link, then recheck. If it still shows blocked, WCL is blocking direct scorecard reads too.",
      checks: [],
      blockedUrl: error.url,
    };
  }

  return {
    status: "error",
    summary: error?.message || "Could not validate this scorecard right now.",
    checks: [],
  };
}

function decodeHtml(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => entities[name.toLowerCase()] ?? match);
}

function textFromHtml(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function meaningfulTokens(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !["cc", "cricket", "club", "the"].includes(token));
}

function playerMatches(rowText, playerName) {
  const haystack = normalizeText(rowText);
  const tokens = meaningfulTokens(playerName);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function absoluteUrl(href) {
  try {
    return new URL(href, WCL_BASE_URL).toString();
  } catch {
    return "";
  }
}

function dateNeedles(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return [String(value ?? "")].filter(Boolean);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const longMonth = new Intl.DateTimeFormat("en-US", { month: "long" }).format(date);
  return [
    `${month}/${day}/${year}`,
    `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`,
    `${shortMonth} ${day}`,
    `${longMonth} ${day}`,
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  ];
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });
  if (!response.ok) {
    throw new WclFetchError(response.status, url);
  }
  return response.text();
}

function rowContextForLink(html, linkIndex) {
  const before = html.lastIndexOf("<tr", linkIndex);
  const after = html.indexOf("</tr>", linkIndex);
  if (before >= 0 && after >= 0) return html.slice(before, after + 5);
  return html.slice(Math.max(0, linkIndex - 800), linkIndex + 800);
}

export function extractMatchLinks(html) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const href = decodeHtml(match[1]);
    const label = textFromHtml(match[2]);
    const joined = `${href} ${label}`.toLowerCase();
    if (!/(score|scorecard|viewscorecard|matchid)/i.test(joined)) continue;
    const url = absoluteUrl(href);
    if (!url || links.some((link) => link.url === url)) continue;
    const contextHtml = rowContextForLink(html, match.index);
    links.push({
      url,
      label,
      context: textFromHtml(contextHtml),
    });
  }
  return links;
}

function scoreMatchLink(link, submission) {
  const context = normalizeText(`${link.label} ${link.context} ${link.url}`);
  const compactContext = normalizeCompact(context);
  let score = 0;

  const homeTokens = meaningfulTokens(submission.homeTeam);
  const awayTokens = meaningfulTokens(submission.awayTeam);
  const teamTokens = [...homeTokens, ...awayTokens];
  teamTokens.forEach((token) => {
    if (context.includes(token)) score += 2;
  });

  if (homeTokens.length && homeTokens.every((token) => context.includes(token))) score += 5;
  if (awayTokens.length && awayTokens.every((token) => context.includes(token))) score += 5;

  dateNeedles(submission.gameDate).forEach((needle) => {
    if (needle && compactContext.includes(normalizeCompact(needle))) score += 7;
  });

  if (submission.ground && context.includes(normalizeText(submission.ground))) score += 2;
  return score;
}

function linkMatchesDate(link, submission) {
  const compactContext = normalizeCompact(`${link.label} ${link.context} ${link.url}`);
  return dateNeedles(submission.gameDate).some(
    (needle) => needle && compactContext.includes(normalizeCompact(needle)),
  );
}

async function findScorecardUrl(submission) {
  if (submission.scorecardUrl) {
    return { url: submission.scorecardUrl, source: "submission" };
  }

  const listHtml = await fetchPage(WCL_MATCH_LIST_URL);
  const candidates = extractMatchLinks(listHtml)
    .map((link) => ({
      ...link,
      dateMatched: linkMatchesDate(link, submission),
      score: scoreMatchLink(link, submission),
    }))
    .sort((a, b) => b.score - a.score);

  const datedBest = candidates.find((candidate) => candidate.dateMatched && candidate.score >= 9);
  const best = datedBest ?? candidates.find((candidate) => candidate.score >= 18);
  if (!best) return null;
  return { url: best.url, source: "match-list", context: best.context, score: best.score };
}

function parseTableRows(tableHtml) {
  const rows = [];
  const rowPattern = /<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(tableHtml))) {
    const rowHtml = rowMatch[0];
    const cells = [];
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowHtml))) {
      cells.push(textFromHtml(cellMatch[1]));
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function parseTables(html) {
  const tables = [];
  const tablePattern = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tablePattern.exec(html))) {
    const rows = parseTableRows(tableMatch[0]);
    if (rows.length) {
      tables.push({
        rows,
        text: rows.flat().join(" "),
      });
    }
  }
  return tables;
}

function normalizeHeader(value) {
  return normalizeCompact(value);
}

function tableType(table) {
  const text = normalizeText(table.rows.slice(0, 4).flat().join(" "));
  const compact = normalizeCompact(text);
  if (/\bbowler\b|\bbowling\b|overs|maidens|economy|wickets/.test(text) || compact.includes("omrw")) {
    return "bowling";
  }
  if (/\bbatsman\b|\bbatting\b|\bbatter\b|strike rate/.test(text) || compact.includes("4s6s") || compact.includes("runsballs")) {
    return "batting";
  }
  return "unknown";
}

function headerIndex(headers, names) {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const needle = normalizeHeader(name);
    const exact = normalized.findIndex((header) => header === needle);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const needle = normalizeHeader(name);
    const partial = normalized.findIndex((header) => header.includes(needle));
    if (partial >= 0) return partial;
  }
  return -1;
}

function findHeaderRow(rows, type) {
  return rows.findIndex((row) => {
    const text = normalizeText(row.join(" "));
    if (type === "batting") return /batsman|batter|batting|strike rate|4s|6s/.test(text);
    return /bowler|bowling|overs|maidens|economy|wickets/.test(text);
  });
}

function numericText(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function cellAt(row, index) {
  return index >= 0 && row[index] !== undefined ? row[index] : "";
}

function firstFilled(values) {
  return values.find((value) => String(value ?? "").trim() !== "") ?? "";
}

function extractBattingFromRow(row, headers) {
  const nameIndex = headerIndex(headers, ["batsman", "batter", "player", "name"]);
  const dataStart = nameIndex >= 0 ? nameIndex + 1 : 1;
  const numericCells = row.slice(dataStart).map(numericText).filter(Boolean);

  return {
    runs: firstFilled([cellAt(row, headerIndex(headers, ["runs", "r"])), numericCells[0]]),
    balls: firstFilled([cellAt(row, headerIndex(headers, ["balls", "b"])), numericCells[1]]),
    fours: firstFilled([cellAt(row, headerIndex(headers, ["4s", "4"])), numericCells[2]]),
    sixes: firstFilled([cellAt(row, headerIndex(headers, ["6s", "6"])), numericCells[3]]),
    strikeRate: firstFilled([cellAt(row, headerIndex(headers, ["sr", "strike rate"])), numericCells[4]]),
  };
}

function extractBowlingFromRow(row, headers) {
  const nameIndex = headerIndex(headers, ["bowler", "player", "name"]);
  const dataStart = nameIndex >= 0 ? nameIndex + 1 : 1;
  const numericCells = row.slice(dataStart).map(numericText).filter(Boolean);

  return {
    overs: firstFilled([cellAt(row, headerIndex(headers, ["overs", "ov", "o"])), numericCells[0]]),
    runs: firstFilled([cellAt(row, headerIndex(headers, ["runs", "r"])), numericCells[2]]),
    wickets: firstFilled([cellAt(row, headerIndex(headers, ["wickets", "wkts", "w"])), numericCells[3]]),
  };
}

function extractStatsForType(tables, playerName, type) {
  for (const table of tables) {
    const detectedType = tableType(table);
    if (detectedType !== type && detectedType !== "unknown") continue;
    const headerRowIndex = findHeaderRow(table.rows, type);
    const headers = headerRowIndex >= 0 ? table.rows[headerRowIndex] : [];
    const dataRows = headerRowIndex >= 0 ? table.rows.slice(headerRowIndex + 1) : table.rows;
    const row = dataRows.find((candidate) => playerMatches(candidate.join(" "), playerName));
    if (!row) continue;
    return type === "batting" ? extractBattingFromRow(row, headers) : extractBowlingFromRow(row, headers);
  }
  return {};
}

export function parseScorecardStatsFromHtml(html, playerName) {
  const tables = parseTables(html);
  return {
    batting: extractStatsForType(tables, playerName, "batting"),
    bowling: extractStatsForType(tables, playerName, "bowling"),
  };
}

function formValue(submission, group, key) {
  return String(submission?.[group]?.[key] ?? "").trim();
}

function comparableNumber(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function valuesMatch(form, scorecard, type) {
  const left = comparableNumber(form);
  const right = comparableNumber(scorecard);
  if (left === null || right === null) return false;
  if (type === "rate") return Math.abs(left - right) <= 0.15;
  return Math.abs(left - right) < 0.001;
}

function addCheck(checks, field, form, scorecard, type = "number") {
  const cleanForm = String(form ?? "").trim();
  if (!cleanForm) return;
  const cleanScorecard = String(scorecard ?? "").trim();
  checks.push({
    field,
    label: FIELD_LABELS[field],
    formValue: cleanForm,
    scorecardValue: cleanScorecard || "Not found",
    ok: cleanScorecard ? valuesMatch(cleanForm, cleanScorecard, type) : false,
  });
}

export function compareSubmissionToScorecard(submission, scorecardStats) {
  const checks = [];
  addCheck(checks, "batting.runs", formValue(submission, "batting", "runs"), scorecardStats.batting?.runs);
  addCheck(checks, "batting.balls", formValue(submission, "batting", "balls"), scorecardStats.batting?.balls);
  addCheck(checks, "batting.fours", formValue(submission, "batting", "fours"), scorecardStats.batting?.fours);
  addCheck(checks, "batting.sixes", formValue(submission, "batting", "sixes"), scorecardStats.batting?.sixes);
  addCheck(
    checks,
    "batting.strikeRate",
    formValue(submission, "batting", "strikeRate"),
    scorecardStats.batting?.strikeRate,
    "rate",
  );
  addCheck(checks, "bowling.overs", formValue(submission, "bowling", "overs"), scorecardStats.bowling?.overs);
  addCheck(checks, "bowling.runs", formValue(submission, "bowling", "runs"), scorecardStats.bowling?.runs);
  addCheck(checks, "bowling.wickets", formValue(submission, "bowling", "wickets"), scorecardStats.bowling?.wickets);
  return checks;
}

export async function validateSubmission(submission) {
  if (!submission?.player) {
    return {
      status: "needs_review",
      summary: "Add the player name before checking the scorecard.",
      checks: [],
    };
  }

  const scorecardMatch = await findScorecardUrl(submission);
  if (!scorecardMatch?.url) {
    return {
      status: "not_found",
      summary: "Could not find a likely WCL scorecard for this date and matchup.",
      checks: [],
      searchedUrl: WCL_MATCH_LIST_URL,
    };
  }

  const scorecardHtml = await fetchPage(scorecardMatch.url);
  const scorecardStats = parseScorecardStatsFromHtml(scorecardHtml, submission.player);
  const checks = compareSubmissionToScorecard(submission, scorecardStats);

  if (!checks.length) {
    return {
      status: "needs_review",
      summary: "Found the scorecard, but could not read matching player stats from it.",
      checks,
      scorecardUrl: scorecardMatch.url,
      scorecardStats,
    };
  }

  const mismatches = checks.filter((check) => !check.ok);
  return {
    status: mismatches.length ? "mismatch" : "match",
    summary: mismatches.length
      ? `${mismatches.length} submitted stat${mismatches.length === 1 ? "" : "s"} do not match the WCL scorecard.`
      : "Submitted performance matches the WCL scorecard.",
    checks,
    scorecardUrl: scorecardMatch.url,
    scorecardStats,
  };
}
