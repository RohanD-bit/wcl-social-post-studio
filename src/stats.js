export function normalizeHeading(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function valueFromRecord(record, possibleNames) {
  const normalized = {};
  Object.keys(record).forEach((key) => {
    normalized[normalizeHeading(key)] = record[key];
  });

  for (const name of possibleNames) {
    const value = normalized[normalizeHeading(name)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

export function normalizeDateForApp(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  return text;
}

export function dateValue(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = dateValue(value);
  if (!date) return value || "Date pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function toTitleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function initials(value) {
  return String(value ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function inferTemplateFromRecord(record) {
  const joined = Object.values(record).join(" ").toLowerCase();
  if (joined.includes("t20") || joined.includes("20 ov") || joined.includes("20 overs")) {
    return "t20";
  }
  return "forty";
}

export function stableRowId(record, index) {
  const keyParts = [
    valueFromRecord(record, ["Timestamp"]),
    valueFromRecord(record, ["Game Date", "Date"]),
    valueFromRecord(record, ["Top Performer", "Player", "Player Name"]),
    valueFromRecord(record, ["Home Team", "Home"]),
    valueFromRecord(record, ["Away Team", "Away"]),
    index + 1,
  ];
  let hash = 0;
  const key = keyParts.join("|");
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return 100000 + hash;
}

export function inferStats(details, current) {
  const text = String(details ?? "");
  const runsMatch =
    text.match(/(\d+)\s*\*?\s*(?:runs|run)/i) ||
    text.match(/(\d+)\s*\*?\s*(?:\(|from|off)/i);
  const ballsMatch =
    text.match(/(?:from|off)\s*(\d+)\s*(?:balls?|ball|b)?/i) ||
    text.match(/\((\d+)\)/);
  const foursMatch =
    text.match(/(\d+)\s*(?:x|[*-])?\s*4s?/i) ||
    text.match(/(\d+)\s*fours?/i);
  const sixesMatch =
    text.match(/(\d+)\s*(?:x|[*-])?\s*6s?/i) ||
    text.match(/(\d+)\s*sixes?/i);
  const wicketsMatch =
    text.match(/(\d+)\s*wickets?/i) ||
    text.match(/w\s*=?\s*(\d+)/i) ||
    text.match(/\d+(?:\.\d+)?-\d+-(\d+)-\d+/);
  const bowlingFigure = text.match(/(\d+(?:\.\d+)?)-(\d+)-(\d+)-(\d+)/);
  const oversMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:overs?|ov)/i) || bowlingFigure;
  const runsGivenMatch =
    text.match(/(?:gave away|given|for)\s*(\d+)\s*(?:runs?|run)/i) ||
    text.match(/(?:overs?|ov)\D+(\d+)\s*(?:runs?|run)/i) ||
    bowlingFigure;

  const runs = runsMatch?.[1] ?? current.batting.runs;
  const balls = ballsMatch?.[1] ?? current.batting.balls;
  const numericRuns = Number(String(runs).replace(/\D/g, ""));
  const strikeRate =
    runs && balls && Number(balls) > 0
      ? ((numericRuns / Number(balls)) * 100).toFixed(2)
      : current.batting.strikeRate;

  return {
    ...current,
    performanceDetails: text,
    batting: {
      runs,
      balls,
      fours: foursMatch?.[1] ?? current.batting.fours,
      sixes: sixesMatch?.[1] ?? current.batting.sixes,
      strikeRate,
    },
    bowling: {
      wickets: wicketsMatch?.[1] ?? bowlingFigure?.[4] ?? current.bowling.wickets,
      overs: oversMatch?.[1] ?? current.bowling.overs,
      runs: runsGivenMatch?.[1] ?? bowlingFigure?.[3] ?? current.bowling.runs,
    },
  };
}

export function recordToSubmission(record, index) {
  const homeTeam = valueFromRecord(record, ["Home Team", "Home"]);
  const awayTeam = valueFromRecord(record, ["Away Team", "Away"]);
  const details = valueFromRecord(record, ["Performance Details", "Performance", "Stats"]);
  const base = {
    id: stableRowId(record, index),
    status: "new",
    template: inferTemplateFromRecord(record),
    gameDate: normalizeDateForApp(valueFromRecord(record, ["Game Date", "Date"])),
    ground: valueFromRecord(record, ["Ground", "Venue"]),
    homeTeam,
    awayTeam,
    division: valueFromRecord(record, ["Division"]),
    player: valueFromRecord(record, ["Top Performer", "Player", "Player Name"]),
    team: homeTeam,
    opponent: awayTeam,
    playerPhotoUrl: valueFromRecord(record, [
      "Upload Player Picture",
      "Player Picture",
      "Photo",
      "Picture",
    ]),
    scorecardUrl: valueFromRecord(record, [
      "Scorecard Link",
      "WCL Scorecard Link",
      "Scorecard URL",
      "WCL Link",
      "Match Link",
    ]),
    performanceDetails: details,
    batting: { runs: "", balls: "", fours: "", sixes: "", strikeRate: "" },
    bowling: { wickets: "", overs: "", runs: "" },
    homeScore: valueFromRecord(record, ["Home Score"]),
    awayScore: valueFromRecord(record, ["Away Score"]),
    result: valueFromRecord(record, ["Result", "Match Result"]),
  };
  return inferStats(details, base);
}

function sameDay(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function latestWeekendDates(submissions) {
  const dates = submissions
    .map((submission) => dateValue(submission.gameDate))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());
  const latest = dates[0];
  if (!latest) return [];
  const start = new Date(latest);
  if (latest.getDay() === 0) start.setDate(latest.getDate() - 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return [start, end];
}

export function isLatestWeekendSubmission(submission, submissions) {
  const dates = latestWeekendDates(submissions);
  if (!dates.length) return true;
  const date = dateValue(submission.gameDate);
  if (!date) return false;
  return dates.some((weekendDate) => sameDay(date, weekendDate));
}

export function buildCaption(submission) {
  const lines = [
    `Player of the Match: ${toTitleCase(submission.player)}`,
    `${submission.team} vs ${submission.opponent}`,
    `${formatDate(submission.gameDate)} at ${submission.ground}`,
    "",
    submission.batting.runs
      ? `Batting: ${submission.batting.runs} (${submission.batting.balls}), ${submission.batting.fours}x4, ${submission.batting.sixes}x6, SR ${submission.batting.strikeRate}`
      : "",
    submission.bowling.wickets
      ? `Bowling: ${submission.bowling.wickets} wickets, ${submission.bowling.overs} overs, ${submission.bowling.runs} runs`
      : "",
    submission.result ? `Result: ${submission.result}` : "",
    "",
    "#WashingtonCricketLeague #WCL #Cricket",
  ];

  return lines.filter((line, index) => line || index === 3 || index === 7).join("\n");
}
