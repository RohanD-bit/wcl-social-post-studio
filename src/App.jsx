import { useEffect, useMemo, useRef, useState } from "react";
import { SAMPLE_SUBMISSIONS, STATUS_LABELS, TEMPLATE_LABELS } from "./data.js";
import { csvToSubmissions, loadGoogleSheet } from "./sheet.js";
import {
  buildCaption,
  dateValue,
  formatDate,
  inferStats,
  initials,
  isLatestWeekendSubmission,
  toTitleCase,
} from "./stats.js";
import { downloadPostImage } from "./canvas.js";
import {
  canValidateScorecard,
  requestScorecardValidation,
  validationSignature,
} from "./wclValidation.js";

const QUEUE_MODES = [
  ["latest", "Latest weekend"],
  ["new", "New"],
  ["verify", "Needs WCL check"],
  ["ready", "Ready to post"],
  ["posted", "Posted"],
  ["all", "All"],
];

const DRAFT_STORAGE_KEY = "wcl-social-post-studio:drafts:v1";
const UI_STORAGE_KEY = "wcl-social-post-studio:ui:v1";
const VALIDATION_STORAGE_KEY = "wcl-social-post-studio:validation:v1";
const EDITABLE_FIELDS = [
  "status",
  "template",
  "gameDate",
  "ground",
  "homeTeam",
  "awayTeam",
  "division",
  "player",
  "team",
  "opponent",
  "playerPhotoUrl",
  "scorecardUrl",
  "performanceDetails",
  "homeScore",
  "awayScore",
  "result",
];
const EDITABLE_GROUPS = {
  batting: ["runs", "balls", "fours", "sixes", "strikeRate"],
  bowling: ["wickets", "overs", "runs"],
};

function loadStoredJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures so the app still works in restricted browser modes.
  }
}

function mergeDrafts(rows, drafts) {
  return rows.map((row) => {
    const draft = drafts[row.id];
    if (!draft) return row;
    return {
      ...row,
      ...draft,
      batting: { ...row.batting, ...draft.batting },
      bowling: { ...row.bowling, ...draft.bowling },
    };
  });
}

function buildDraftPatch(base, next) {
  const patch = {};
  EDITABLE_FIELDS.forEach((field) => {
    if ((base?.[field] ?? "") !== (next?.[field] ?? "")) {
      patch[field] = next?.[field] ?? "";
    }
  });

  Object.entries(EDITABLE_GROUPS).forEach(([group, fields]) => {
    const groupPatch = {};
    fields.forEach((field) => {
      if ((base?.[group]?.[field] ?? "") !== (next?.[group]?.[field] ?? "")) {
        groupPatch[field] = next?.[group]?.[field] ?? "";
      }
    });
    if (Object.keys(groupPatch).length) {
      patch[group] = groupPatch;
    }
  });

  return patch;
}

function getVisibleRows(rows, mode, search) {
  const term = search.trim().toLowerCase();
  let visible = [...rows];
  if (mode === "latest") {
    visible = visible.filter((row) => isLatestWeekendSubmission(row, rows));
  } else if (mode !== "all") {
    visible = visible.filter((row) => row.status === mode);
  }
  if (term) {
    visible = visible.filter((row) =>
      [row.player, row.homeTeam, row.awayTeam, row.team, row.opponent, row.division, row.ground]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }
  return visible.sort((a, b) => {
    const aTime = dateValue(a.gameDate)?.getTime() ?? 0;
    const bTime = dateValue(b.gameDate)?.getTime() ?? 0;
    return bTime - aTime || a.player.localeCompare(b.player);
  });
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange, readOnly = false }) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      <textarea value={value ?? ""} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />
    </label>
  );
}

function posterNameStyle(value) {
  const length = toTitleCase(value || "Player").length;
  let size = 26;
  if (length > 22) size = 23;
  if (length > 30) size = 20;
  if (length > 40) size = 17;
  if (length > 52) size = 15;
  return { "--poster-name-size": `${size}px` };
}

function buildCanvaPackage(submission, caption) {
  const templateName = TEMPLATE_LABELS[submission.template] ?? "Player of the Match";
  const battingLine = `${submission.batting.runs || "-"} (${submission.batting.balls || "-"})${
    submission.batting.fours || submission.batting.sixes
      ? `, ${submission.batting.fours || "0"}x4, ${submission.batting.sixes || "0"}x6`
      : ""
  }${submission.batting.strikeRate ? `, SR ${submission.batting.strikeRate}` : ""}`;
  const bowlingLine = submission.bowling.wickets
    ? `${submission.bowling.wickets} wickets, ${submission.bowling.overs || "-"} overs, ${submission.bowling.runs || "-"} runs`
    : "No bowling details";

  return [
    `Template: ${templateName}`,
    `Player of the match caption: ${caption.split("\n")[0] || "Player of the Match"}`,
    `Post caption:\n${caption}`,
    "",
    `Division: ${submission.division || "Division TBD"}`,
    `Player photo: ${submission.playerPhotoUrl || "Add player photo from Drive"}`,
    `Player name: ${toTitleCase(submission.player || "Player")}`,
    `Player team logo: ${submission.team || submission.homeTeam || "Add player team logo"}`,
    `Performance details: ${submission.performanceDetails || "Add performance details"}`,
    `Batting: ${battingLine}`,
    `Bowling: ${bowlingLine}`,
    "",
    `Team A: ${submission.homeTeam || "Home team"}`,
    `Team A logo: Add ${submission.homeTeam || "home team"} logo`,
    `Team A score: ${submission.homeScore || "Score TBD"}`,
    `Team B: ${submission.awayTeam || "Away team"}`,
    `Team B logo: Add ${submission.awayTeam || "away team"} logo`,
    `Team B score: ${submission.awayScore || "Score TBD"}`,
    `Result: ${submission.result || "Result pending"}`,
    `Date: ${formatDate(submission.gameDate)}`,
    `Venue: ${submission.ground || "Venue TBD"}`,
  ].join("\n");
}

function SubmissionList({
  rows,
  visibleRows,
  selectedId,
  onSelect,
  queueMode,
  setQueueMode,
  search,
  setSearch,
  visibleLimit,
  setVisibleLimit,
}) {
  const shown = visibleRows.slice(0, visibleLimit);
  const modeLabel = QUEUE_MODES.find(([value]) => value === queueMode)?.[1] ?? "Submissions";

  return (
    <aside className="rail">
      <div className="rail-heading">
        <div>
          <p className="section-kicker">Worklist</p>
          <h2>Submissions</h2>
        </div>
        <strong>{shown.length}</strong>
      </div>

      <div className="queue-toolbar">
        <select
          value={queueMode}
          onChange={(event) => {
            setQueueMode(event.target.value);
            setVisibleLimit(24);
          }}
        >
          {QUEUE_MODES.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setVisibleLimit(24);
          }}
          placeholder="Search player, team, division"
        />
      </div>

      <p className="queue-summary">
        Showing {shown.length} of {visibleRows.length} {modeLabel.toLowerCase()} from {rows.length} total rows.
      </p>

      <div className="queue-list">
        {shown.map((row) => (
          <button
            className={`queue-card ${selectedId === row.id ? "selected" : ""}`}
            key={row.id}
            onClick={() => onSelect(row.id)}
          >
            <span className={`status-dot ${row.status}`} />
            <span className="queue-card-main">
              <strong>{toTitleCase(row.player || "Unnamed player")}</strong>
              <small>
                {row.homeTeam || "Home team"} vs {row.awayTeam || "Away team"}
              </small>
              <em>{formatDate(row.gameDate)}</em>
            </span>
          </button>
        ))}
      </div>

      {visibleRows.length > shown.length && (
        <button className="show-more" onClick={() => setVisibleLimit((current) => current + 24)}>
          Show {Math.min(24, visibleRows.length - shown.length)} more
        </button>
      )}
    </aside>
  );
}

function ScorecardCheck({ selected, validation, isLoading, isStale, canValidate, onValidate }) {
  const status = validation?.status ?? "idle";
  const statusText = {
    api_unavailable: "Backend not running",
    blocked: "WCL blocked lookup",
    error: "Could not check",
    idle: "Not checked",
    match: "Matched",
    mismatch: "Mismatch",
    needs_review: "Needs review",
    not_found: "Scorecard not found",
  }[status];
  const summary =
    validation?.summary ??
    "Compare the submitted performance details against the WCL scorecard for this match.";

  return (
    <div className={`scorecard-check ${status}`}>
      <div className="scorecard-check-header">
        <div>
          <p className="section-kicker">WCL scorecard validation</p>
          <h3>Performance check</h3>
        </div>
        <span>{isLoading ? "Checking..." : statusText}</span>
      </div>

      <p className="scorecard-summary">
        {isStale ? "Stats changed after the last check. Recheck before posting." : summary}
      </p>

      <div className="scorecard-actions">
        <button onClick={onValidate} disabled={!canValidate || isLoading}>
          {isLoading ? "Checking WCL..." : validation ? "Recheck scorecard" : "Check scorecard"}
        </button>
        {validation?.scorecardUrl && (
          <a href={validation.scorecardUrl} target="_blank" rel="noreferrer">
            Open scorecard
          </a>
        )}
      </div>

      {!canValidate && (
        <p className="scorecard-hint">
          Add player, date, teams, and performance details. A direct scorecard link helps when WCL search cannot find it.
        </p>
      )}

      {status === "blocked" && (
        <p className="scorecard-hint">
          This is a WCL website access block, not a stats mismatch. Try pasting the exact scorecard URL in the Scorecard
          link field, then recheck.
        </p>
      )}

      {status === "api_unavailable" && (
        <p className="scorecard-hint">
          The current localhost preview is static, so it cannot run the scorecard checker. Push to Vercel to test the
          backend checker, or run the Vite dev server locally.
        </p>
      )}

      {validation?.checks?.length > 0 && (
        <div className="check-list">
          {validation.checks.map((check) => (
            <div className={`check-row ${check.ok ? "ok" : "bad"}`} key={check.field}>
              <strong>{check.label}</strong>
              <span>Form: {check.formValue || "-"}</span>
              <span>WCL: {check.scorecardValue || "-"}</span>
              <b>{check.ok ? "OK" : "Fix"}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewDesk({
  selected,
  updateSelected,
  validation,
  validationLoading,
  validationStale,
  canValidate,
  validateSelected,
}) {
  function updateField(key, value) {
    updateSelected({ ...selected, [key]: value });
  }

  function updateNested(group, key, value) {
    updateSelected({
      ...selected,
      [group]: { ...selected[group], [key]: value },
    });
  }

  return (
    <section className="review-desk">
      <div className="desk-header">
        <div>
          <p className="section-kicker">Review desk</p>
          <h2>{toTitleCase(selected.player || "Select a player")}</h2>
        </div>
        <select value={selected.status} onChange={(event) => updateField("status", event.target.value)}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="template-toggle">
        {Object.entries(TEMPLATE_LABELS).map(([value, label]) => (
          <button
            className={selected.template === value ? "active" : ""}
            key={value}
            onClick={() => updateField("template", value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="form-section">
        <div className="section-title">
          <h3>Match</h3>
          <span>Date, teams, venue, and result</span>
        </div>
        <div className="form-grid">
          <Field label="Game date" value={selected.gameDate} onChange={(value) => updateField("gameDate", value)} />
          <Field label="Ground" value={selected.ground} onChange={(value) => updateField("ground", value)} />
          <Field label="Home team" value={selected.homeTeam} onChange={(value) => updateField("homeTeam", value)} />
          <Field label="Away team" value={selected.awayTeam} onChange={(value) => updateField("awayTeam", value)} />
          <Field label="Home score" value={selected.homeScore} onChange={(value) => updateField("homeScore", value)} />
          <Field label="Away score" value={selected.awayScore} onChange={(value) => updateField("awayScore", value)} />
          <Field label="Division" value={selected.division} onChange={(value) => updateField("division", value)} />
          <Field label="Result" value={selected.result} onChange={(value) => updateField("result", value)} />
          <Field label="Scorecard link" value={selected.scorecardUrl} onChange={(value) => updateField("scorecardUrl", value)} />
        </div>
      </div>

      <div className="form-section">
        <div className="section-title">
          <h3>Player and stats</h3>
          <span>Clean the form text into post-ready stats</span>
        </div>
        <div className="form-grid">
          <Field label="Player" value={selected.player} onChange={(value) => updateField("player", value)} />
          <Field label="Player team" value={selected.team} onChange={(value) => updateField("team", value)} />
          <Field label="Opponent" value={selected.opponent} onChange={(value) => updateField("opponent", value)} />
          <Field label="Photo link" value={selected.playerPhotoUrl} onChange={(value) => updateField("playerPhotoUrl", value)} />
        </div>
        <TextArea
          label="Performance details from form"
          value={selected.performanceDetails}
          onChange={(value) => updateSelected(inferStats(value, selected))}
        />
        <div className="stat-grid">
          <Field label="Runs" value={selected.batting.runs} onChange={(value) => updateNested("batting", "runs", value)} />
          <Field label="Balls" value={selected.batting.balls} onChange={(value) => updateNested("batting", "balls", value)} />
          <Field label="4s" value={selected.batting.fours} onChange={(value) => updateNested("batting", "fours", value)} />
          <Field label="6s" value={selected.batting.sixes} onChange={(value) => updateNested("batting", "sixes", value)} />
          <Field
            label="Strike rate"
            value={selected.batting.strikeRate}
            onChange={(value) => updateNested("batting", "strikeRate", value)}
          />
          <Field
            label="Wickets"
            value={selected.bowling.wickets}
            onChange={(value) => updateNested("bowling", "wickets", value)}
          />
          <Field label="Overs" value={selected.bowling.overs} onChange={(value) => updateNested("bowling", "overs", value)} />
          <Field
            label="Runs given"
            value={selected.bowling.runs}
            onChange={(value) => updateNested("bowling", "runs", value)}
          />
        </div>
      </div>

      <ScorecardCheck
        selected={selected}
        validation={validation}
        isLoading={validationLoading}
        isStale={validationStale}
        canValidate={canValidate}
        onValidate={validateSelected}
      />

      <div className="verification-strip">
        <a
          href="https://www.wclinc.com/wclinc/listMatches.do?league=0&clubId=670"
          target="_blank"
          rel="noreferrer"
        >
          Open WCL matches
        </a>
        {selected.scorecardUrl && (
          <a href={selected.scorecardUrl} target="_blank" rel="noreferrer">
            Open scorecard link
          </a>
        )}
        {selected.playerPhotoUrl && (
          <a href={selected.playerPhotoUrl} target="_blank" rel="noreferrer">
            Open player photo
          </a>
        )}
      </div>
    </section>
  );
}

function PosterPreview({ submission }) {
  if (submission.template === "forty") {
    return (
      <div className="poster-preview forty-preview">
        <aside>PLAYER OF THE MATCH</aside>
        <main>
          <header>
            <strong>WCL 40 OVERS</strong>
            <span>{submission.division || "Division TBD"}</span>
          </header>
          <div className="field-visual">
            <div className="pitch" />
            <div className="player-badge">{initials(submission.player)}</div>
          </div>
          <h3 style={posterNameStyle(submission.player)}>{toTitleCase(submission.player || "Player")}</h3>
          <div className="poster-stat-row">
            <b>
              {submission.batting.runs || "-"} ({submission.batting.balls || "-"})
            </b>
            <b>{submission.bowling.wickets || "-"} wickets</b>
          </div>
          <footer>{submission.result || "Result pending"}</footer>
        </main>
      </div>
    );
  }

  return (
    <div className="poster-preview t20-preview">
      <div className="t20-topline">
        <span>WCL T20</span>
        <em>{submission.division || "Division TBD"}</em>
      </div>
      <div className="t20-hero">
        <h3>
          Player
          <br />
          of the
          <br />
          Match
        </h3>
        <div className="t20-figure">
          <span>{initials(submission.player)}</span>
        </div>
      </div>
      <div className="name-ribbon">{toTitleCase(submission.player || "Player")}</div>
      <div className="t20-stats">
        <div className="t20-stat">
          <span>Runs</span>
          <b>{submission.batting.runs || "-"}</b>
        </div>
        <div className="t20-stat">
          <span>Balls</span>
          <b>{submission.batting.balls || "-"}</b>
        </div>
        <div className="t20-stat">
          <span>Wickets</span>
          <b>{submission.bowling.wickets || "-"}</b>
        </div>
        <div className="t20-stat">
          <span>Overs</span>
          <b>{submission.bowling.overs || "-"}</b>
        </div>
      </div>
      <footer>{submission.result || "Result pending"}</footer>
    </div>
  );
}

function PublishKit({ selected, caption, canvaPackage, copyCaption, copyCanvaPackage }) {
  return (
    <aside className="publish-kit">
      <div className="publish-header">
        <div>
          <p className="section-kicker">Publish kit</p>
          <h2>Facebook package</h2>
        </div>
        <span>{TEMPLATE_LABELS[selected.template]}</span>
      </div>

      <PosterPreview submission={selected} />

      <div className="action-row">
        <button onClick={copyCaption}>Copy caption</button>
        <button onClick={copyCanvaPackage}>Copy Canva package</button>
        <button className="primary" onClick={() => downloadPostImage(selected)}>
          Download image
        </button>
      </div>

      <TextArea label="Suggested caption" value={caption} readOnly />
      <TextArea label="Canva template package" value={canvaPackage} readOnly />
    </aside>
  );
}

export default function App() {
  const [submissions, setSubmissions] = useState(SAMPLE_SUBMISSIONS);
  const [drafts, setDrafts] = useState(() => loadStoredJson(DRAFT_STORAGE_KEY, {}));
  const [validationResults, setValidationResults] = useState(() =>
    loadStoredJson(VALIDATION_STORAGE_KEY, {}),
  );
  const [validationLoading, setValidationLoading] = useState({});
  const [selectedId, setSelectedId] = useState(
    () => loadStoredJson(UI_STORAGE_KEY, {}).selectedId ?? SAMPLE_SUBMISSIONS[0].id,
  );
  const [queueMode, setQueueMode] = useState(() => loadStoredJson(UI_STORAGE_KEY, {}).queueMode ?? "latest");
  const [search, setSearch] = useState(() => loadStoredJson(UI_STORAGE_KEY, {}).search ?? "");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [sourceStatus, setSourceStatus] = useState("Loading real submissions from Google Sheets...");
  const [lastChecked, setLastChecked] = useState("");
  const lastSignatureRef = useRef("");
  const fileInputRef = useRef(null);
  const draftsRef = useRef(drafts);
  const baseRowsRef = useRef(SAMPLE_SUBMISSIONS);

  const visibleRows = useMemo(
    () => getVisibleRows(submissions, queueMode, search),
    [submissions, queueMode, search],
  );

  const selected = useMemo(() => {
    return submissions.find((row) => row.id === selectedId) ?? visibleRows[0] ?? submissions[0];
  }, [selectedId, submissions, visibleRows]);

  const caption = useMemo(() => buildCaption(selected), [selected]);
  const canvaPackage = useMemo(() => buildCanvaPackage(selected, caption), [selected, caption]);
  const selectedValidationSignature = useMemo(() => validationSignature(selected), [selected]);
  const selectedValidation = validationResults[selected.id];
  const selectedValidationStale =
    Boolean(selectedValidation?.signature) && selectedValidation.signature !== selectedValidationSignature;
  const selectedCanValidate = canValidateScorecard(selected);

  useEffect(() => {
    draftsRef.current = drafts;
    saveStoredJson(DRAFT_STORAGE_KEY, drafts);
  }, [drafts]);

  useEffect(() => {
    saveStoredJson(VALIDATION_STORAGE_KEY, validationResults);
  }, [validationResults]);

  useEffect(() => {
    saveStoredJson(UI_STORAGE_KEY, {
      selectedId,
      queueMode,
      search,
    });
  }, [selectedId, queueMode, search]);

  useEffect(() => {
    if (visibleRows.length && !visibleRows.some((row) => row.id === selectedId)) {
      setSelectedId(visibleRows[0].id);
    }
  }, [visibleRows, selectedId]);

  useEffect(() => {
    if (!selected?.id || !selectedCanValidate) return undefined;
    const cached = validationResults[selected.id];
    if (cached?.signature === selectedValidationSignature && cached.status !== "error") return undefined;
    const timer = window.setTimeout(() => {
      validateSubmission(selected, { quiet: true });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [selected?.id, selectedValidationSignature, selectedCanValidate]);

  async function refreshSheet({ quiet = false } = {}) {
    if (!quiet) setSourceStatus("Loading Google Sheet...");
    try {
      const rows = await loadGoogleSheet();
      baseRowsRef.current = rows;
      const merged = mergeDrafts(rows, draftsRef.current);
      const signature = JSON.stringify(merged);
      const checked = new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
      setLastChecked(checked);
      if (signature !== lastSignatureRef.current) {
        lastSignatureRef.current = signature;
        setSubmissions(merged);
      }
      setSourceStatus(`Live Google Sheet connected. ${rows.length} rows loaded. Last checked ${checked}.`);
    } catch (error) {
      setSourceStatus(`${error.message} Use Import CSV if the sheet is not public.`);
    }
  }

  useEffect(() => {
    refreshSheet();
    const timer = window.setInterval(() => refreshSheet({ quiet: true }), 60000);
    return () => window.clearInterval(timer);
  }, []);

  function updateSelected(next) {
    setSubmissions((current) => current.map((row) => (row.id === next.id ? next : row)));
    setDrafts((current) => {
      const base = baseRowsRef.current.find((row) => row.id === next.id) ?? selected;
      const patch = buildDraftPatch(base, next);
      if (!Object.keys(patch).length) {
        const nextDrafts = { ...current };
        delete nextDrafts[next.id];
        return nextDrafts;
      }
      return { ...current, [next.id]: patch };
    });
  }

  async function validateSubmission(submission = selected, { quiet = false } = {}) {
    if (!canValidateScorecard(submission)) return;
    const signature = validationSignature(submission);
    if (!quiet) {
      setValidationResults((current) => ({
        ...current,
        [submission.id]: {
          status: "idle",
          summary: "Checking WCL scorecard...",
          checks: [],
          signature,
        },
      }));
    }
    setValidationLoading((current) => ({ ...current, [submission.id]: true }));
    try {
      const result = await requestScorecardValidation(submission);
      setValidationResults((current) => ({
        ...current,
        [submission.id]: {
          ...result,
          signature,
          checkedAt: new Date().toISOString(),
        },
      }));
    } catch (error) {
      setValidationResults((current) => ({
        ...current,
        [submission.id]: {
          status: "error",
          summary: error.message || "Could not validate this scorecard right now.",
          checks: [],
          signature,
          checkedAt: new Date().toISOString(),
        },
      }));
    } finally {
      setValidationLoading((current) => ({ ...current, [submission.id]: false }));
    }
  }

  function handleCsv(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = csvToSubmissions(String(reader.result ?? ""));
      if (!rows.length) {
        setSourceStatus("No usable rows found in that CSV.");
        return;
      }
      baseRowsRef.current = rows;
      const merged = mergeDrafts(rows, draftsRef.current);
      setSubmissions(merged);
      setSelectedId(merged[0].id);
      setSourceStatus(`Loaded ${rows.length} rows from ${file.name}.`);
    };
    reader.onerror = () => setSourceStatus("Could not read that CSV file.");
    reader.readAsText(file);
  }

  async function copyCaption() {
    await copyText(caption);
  }

  async function copyCanvaPackage() {
    await copyText(canvaPackage);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
  }

  const metrics = {
    new: submissions.filter((row) => row.status === "new").length,
    verify: submissions.filter((row) => row.status === "verify").length,
    ready: submissions.filter((row) => row.status === "ready").length,
    posted: submissions.filter((row) => row.status === "posted").length,
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Washington Cricket League</p>
          <h1>Social Post Studio</h1>
          <p className="header-subtitle">Review weekly submissions, clean stats, and prepare post-ready graphics.</p>
        </div>
        <div className="header-actions">
          <button onClick={() => refreshSheet()}>Refresh Sheet</button>
          <button
            title="Choose a .csv file exported from Google Sheets."
            onClick={() => {
              setSourceStatus(
                "Choose a .csv file exported from Google Sheets: File > Download > Comma-separated values (.csv).",
              );
              fileInputRef.current?.click();
            }}
          >
            Import CSV file
          </button>
          <button className="primary" onClick={() => downloadPostImage(selected)}>
            Download Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleCsv(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <section className="status-band">
        <span>{sourceStatus}</span>
        <div className="status-flags">
          <strong>Workflow saved in this browser</strong>
          {lastChecked && <strong>Auto-refreshes every 60 seconds</strong>}
        </div>
      </section>

      <section className="metrics">
        {Object.entries(metrics).map(([status, count]) => (
          <div className="metric" key={status}>
            <span>{STATUS_LABELS[status]}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </section>

      <section className="workspace">
        <SubmissionList
          rows={submissions}
          visibleRows={visibleRows}
          selectedId={selected.id}
          onSelect={setSelectedId}
          queueMode={queueMode}
          setQueueMode={setQueueMode}
          search={search}
          setSearch={setSearch}
          visibleLimit={visibleLimit}
          setVisibleLimit={setVisibleLimit}
        />
        <ReviewDesk
          selected={selected}
          updateSelected={updateSelected}
          validation={selectedValidation}
          validationLoading={Boolean(validationLoading[selected.id])}
          validationStale={selectedValidationStale}
          canValidate={selectedCanValidate}
          validateSelected={() => validateSubmission(selected)}
        />
        <PublishKit
          selected={selected}
          caption={caption}
          canvaPackage={canvaPackage}
          copyCaption={copyCaption}
          copyCanvaPackage={copyCanvaPackage}
        />
      </section>
    </main>
  );
}
