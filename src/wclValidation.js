const VALIDATION_FIELDS = [
  "id",
  "player",
  "gameDate",
  "ground",
  "homeTeam",
  "awayTeam",
  "scorecardUrl",
  "performanceDetails",
  "batting.runs",
  "batting.balls",
  "batting.fours",
  "batting.sixes",
  "batting.strikeRate",
  "bowling.overs",
  "bowling.runs",
  "bowling.wickets",
];

function nestedValue(row, field) {
  return field.split(".").reduce((current, part) => current?.[part], row);
}

export function validationSignature(submission) {
  return JSON.stringify(
    VALIDATION_FIELDS.map((field) => [field, String(nestedValue(submission, field) ?? "").trim()]),
  );
}

export function canValidateScorecard(submission) {
  const hasMatchTarget =
    Boolean(submission?.scorecardUrl) ||
    Boolean(submission?.gameDate && submission?.homeTeam && submission?.awayTeam);
  const hasStats =
    Boolean(submission?.performanceDetails) ||
    Boolean(submission?.batting?.runs) ||
    Boolean(submission?.bowling?.wickets);
  return Boolean(submission?.player && hasMatchTarget && hasStats);
}

export async function requestScorecardValidation(submission) {
  const response = await fetch("/api/validate-wcl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submission }),
  });

  if (!response.ok) {
    if ([404, 405, 501].includes(response.status)) {
      return {
        status: "api_unavailable",
        summary:
          "The scorecard checker backend is not running on this localhost preview. Test this on the deployed Vercel app, or run the app with the Vite dev server so /api/validate-wcl is available.",
        checks: [],
      };
    }

    return {
      status: "error",
      summary: `Validation request failed with ${response.status}.`,
      checks: [],
    };
  }

  return response.json();
}
