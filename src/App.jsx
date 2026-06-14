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

const QUEUE_MODES = [
  ["latest", "Latest weekend"],
  ["new", "New"],
  ["verify", "Needs WCL check"],
  ["ready", "Ready to post"],
  ["posted", "Posted"],
  ["all", "All"],
];

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

function ReviewDesk({ selected, updateSelected }) {
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

      <div className="verification-strip">
        <a
          href={`https://www.wclinc.com/?q=${encodeURIComponent(
            `${selected.gameDate} ${selected.homeTeam} ${selected.awayTeam}`,
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          Open WCL search
        </a>
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
          <h3>{toTitleCase(submission.player || "Player")}</h3>
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
      <header>
        <span>WCL T20</span>
        <strong>PLAYER OF THE MATCH</strong>
      </header>
      <div className="t20-figure">
        <span>{initials(submission.player)}</span>
      </div>
      <div className="name-ribbon">{toTitleCase(submission.player || "Player")}</div>
      <div className="t20-stats">
        <span>Runs</span>
        <b>{submission.batting.runs || "-"}</b>
        <span>Balls</span>
        <b>{submission.batting.balls || "-"}</b>
        <span>Wickets</span>
        <b>{submission.bowling.wickets || "-"}</b>
        <span>Overs</span>
        <b>{submission.bowling.overs || "-"}</b>
      </div>
      <footer>{submission.result || "Result pending"}</footer>
    </div>
  );
}

function PublishKit({ selected, caption, copyCaption }) {
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
        <button className="primary" onClick={() => downloadPostImage(selected)}>
          Download image
        </button>
      </div>

      <TextArea label="Suggested caption" value={caption} readOnly />
    </aside>
  );
}

export default function App() {
  const [submissions, setSubmissions] = useState(SAMPLE_SUBMISSIONS);
  const [drafts, setDrafts] = useState({});
  const [selectedId, setSelectedId] = useState(SAMPLE_SUBMISSIONS[0].id);
  const [queueMode, setQueueMode] = useState("latest");
  const [search, setSearch] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const [sourceStatus, setSourceStatus] = useState("Loading real submissions from Google Sheets...");
  const [lastChecked, setLastChecked] = useState("");
  const lastSignatureRef = useRef("");
  const fileInputRef = useRef(null);

  const visibleRows = useMemo(
    () => getVisibleRows(submissions, queueMode, search),
    [submissions, queueMode, search],
  );

  const selected = useMemo(() => {
    return submissions.find((row) => row.id === selectedId) ?? visibleRows[0] ?? submissions[0];
  }, [selectedId, submissions, visibleRows]);

  const caption = useMemo(() => buildCaption(selected), [selected]);

  useEffect(() => {
    if (visibleRows.length && !visibleRows.some((row) => row.id === selectedId)) {
      setSelectedId(visibleRows[0].id);
    }
  }, [visibleRows, selectedId]);

  async function refreshSheet({ quiet = false } = {}) {
    if (!quiet) setSourceStatus("Loading Google Sheet...");
    try {
      const rows = await loadGoogleSheet();
      const merged = mergeDrafts(rows, drafts);
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
    setDrafts((current) => ({ ...current, [next.id]: next }));
  }

  function handleCsv(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = csvToSubmissions(String(reader.result ?? ""));
      if (!rows.length) {
        setSourceStatus("No usable rows found in that CSV.");
        return;
      }
      const merged = mergeDrafts(rows, drafts);
      setSubmissions(merged);
      setSelectedId(merged[0].id);
      setSourceStatus(`Loaded ${rows.length} rows from ${file.name}.`);
    };
    reader.onerror = () => setSourceStatus("Could not read that CSV file.");
    reader.readAsText(file);
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = caption;
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
          <button onClick={() => fileInputRef.current?.click()}>Import CSV</button>
          <button className="primary" onClick={() => downloadPostImage(selected)}>
            Download Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
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
        {lastChecked && <strong>Auto-refreshes every 60 seconds</strong>}
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
        <ReviewDesk selected={selected} updateSelected={updateSelected} />
        <PublishKit selected={selected} caption={caption} copyCaption={copyCaption} />
      </section>
    </main>
  );
}
