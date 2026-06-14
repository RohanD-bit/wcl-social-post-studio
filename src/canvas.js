import { formatDate, initials, toTitleCase } from "./stats.js";

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function fitText(context, text, x, y, maxWidth, startSize, weight = 900, color = "#0f172a") {
  let size = startSize;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  do {
    context.font = `${weight} ${size}px Arial`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size >= 18);
  context.fillText(text, x, y);
}

function drawLogo(context, x, y, radius, label, color) {
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = color;
  context.stroke();
  context.fillStyle = "#111827";
  context.font = `900 ${Math.max(22, radius * 0.7)}px Arial`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(initials(label) || "WCL", x, y + 1);
  context.restore();
}

function drawPlayerSilhouette(context, x, y, width, height, mode, label) {
  context.save();
  if (mode === "t20") {
    context.fillStyle = "#e5e7eb";
    context.beginPath();
    context.ellipse(x + width / 2, y + height * 0.34, width * 0.36, height * 0.24, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#dc2f35";
    roundRect(context, x + width * 0.14, y + height * 0.42, width * 0.72, height * 0.42, 34);
    context.fill();
    context.fillStyle = "#111827";
    roundRect(context, x + width * 0.19, y + height * 0.52, width * 0.62, height * 0.28, 24);
    context.fill();
  } else {
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.ellipse(x + width / 2, y + height * 0.34, width * 0.34, height * 0.24, 0, 0, Math.PI * 2);
    context.fill();
    context.fillRect(x + width * 0.24, y + height * 0.42, width * 0.52, height * 0.45);
  }
  context.fillStyle = mode === "t20" ? "#ffffff" : "#cdb86f";
  context.beginPath();
  context.arc(x + width / 2, y + height * 0.56, 56, 0, Math.PI * 2);
  context.fill();
  fitText(context, initials(label), x + width / 2, y + height * 0.56, 100, 36, 900, "#10223e");
  context.restore();
}

function statLine(context, label, value, x, y, width, accent = "#2aa8ef") {
  context.fillStyle = accent;
  context.font = "900 22px Arial";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(label.toUpperCase(), x, y);
  context.fillStyle = "#ffffff";
  context.font = "900 72px Arial";
  context.fillText(value || "-", x + width * 0.55, y + 10);
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(x + width * 0.52, y + 28);
  context.lineTo(x + width, y + 28);
  context.stroke();
}

export function drawPost(context, submission) {
  context.canvas.width = 1080;
  context.canvas.height = 1350;
  if (submission.template === "t20") {
    drawT20(context, submission);
  } else {
    drawForty(context, submission);
  }
}

function drawT20(context, submission) {
  const gradient = context.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#07182e");
  gradient.addColorStop(0.62, "#12213a");
  gradient.addColorStop(1, "#1f513c");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1080, 1350);

  context.fillStyle = "rgba(255,255,255,0.07)";
  for (let i = 0; i < 6; i += 1) {
    context.beginPath();
    context.arc(760 + i * 26, 250 + i * 46, 160 + i * 24, 0, Math.PI * 2);
    context.fill();
  }

  drawLogo(context, 92, 92, 56, "WCL", "#c2413f");
  context.fillStyle = "rgba(255,255,255,0.5)";
  context.font = "900 54px Arial";
  context.textAlign = "center";
  context.fillText("WCL T20", 540, 96);
  context.fillStyle = "#ffffff";
  context.font = "900 124px Arial";
  context.textAlign = "left";
  context.fillText("PLAYER", 68, 330);
  context.fillText("MATCH", 154, 448);
  context.fillStyle = "#4fc3ff";
  context.font = "900 50px Arial";
  context.fillText("OF", 70, 380);
  context.fillText("THE", 70, 438);

  drawPlayerSilhouette(context, 570, 270, 430, 620, "t20", submission.player);

  context.fillStyle = "#1594ed";
  roundRect(context, 68, 504, 560, 96, 8);
  context.fill();
  fitText(context, toTitleCase(submission.player), 348, 552, 500, 44, 900, "#ffffff");

  statLine(context, "Runs", submission.batting.runs, 72, 720, 280);
  statLine(context, "Balls", submission.batting.balls, 386, 720, 260);
  statLine(context, "Wickets", submission.bowling.wickets, 72, 858, 280);
  statLine(context, "Overs", submission.bowling.overs, 386, 858, 260);

  context.fillStyle = "#1594ed";
  roundRect(context, 72, 1025, 620, 78, 8);
  context.fill();
  fitText(context, (submission.result || "Result pending").toUpperCase(), 382, 1065, 560, 32, 900, "#ffffff");

  context.fillStyle = "#1585d6";
  roundRect(context, 104, 1208, 374, 78, 10);
  context.fill();
  roundRect(context, 602, 1208, 374, 78, 10);
  context.fill();
  drawLogo(context, 100, 1247, 50, submission.homeTeam, "#a3a337");
  drawLogo(context, 980, 1247, 50, submission.awayTeam, "#2f8a55");
  context.fillStyle = "#ffffff";
  context.font = "900 26px Arial";
  context.textAlign = "left";
  context.fillText(submission.homeTeam.toUpperCase() || "HOME TEAM", 184, 1238);
  context.font = "800 24px Arial";
  context.fillText(submission.homeScore || "Score TBD", 184, 1272);
  context.textAlign = "right";
  context.font = "900 26px Arial";
  context.fillText(submission.awayTeam.toUpperCase() || "AWAY TEAM", 896, 1238);
  context.font = "800 24px Arial";
  context.fillText(submission.awayScore || "Score TBD", 896, 1272);
  context.fillStyle = "#ffffff";
  context.font = "900 68px Arial";
  context.textAlign = "center";
  context.fillText("VS", 540, 1264);
  context.font = "900 28px Arial";
  context.fillText(
    `${formatDate(submission.gameDate).toUpperCase()}  |  ${submission.ground.toUpperCase() || "VENUE TBD"}`,
    540,
    1330,
  );
}

function drawForty(context, submission) {
  context.fillStyle = "#f8f7f4";
  context.fillRect(0, 0, 1080, 1350);
  context.fillStyle = "#10223e";
  context.fillRect(0, 0, 300, 1350);
  drawLogo(context, 150, 94, 56, "WCL", "#c2413f");

  context.save();
  context.translate(96, 1070);
  context.rotate(-Math.PI / 2);
  context.fillStyle = "#ffffff";
  context.font = "900 72px Arial";
  context.textAlign = "left";
  context.fillText("PLAYER OF THE MATCH", 0, 0);
  context.restore();

  context.fillStyle = "#ffffff";
  context.font = "900 26px Arial";
  context.textAlign = "center";
  context.fillText(formatDate(submission.gameDate).toUpperCase(), 150, 1190);
  context.fillText((submission.ground || "Venue TBD").toUpperCase(), 150, 1260);

  context.fillStyle = "#ff565d";
  context.font = "900 82px Arial";
  context.textAlign = "center";
  context.fillText("WCL 40 OVERS", 700, 152);
  context.fillStyle = "#0f172a";
  context.font = "900 34px Arial";
  context.textAlign = "right";
  context.fillText((submission.division || "Division TBD").toUpperCase(), 1014, 206);

  const fieldGradient = context.createLinearGradient(360, 250, 1020, 920);
  fieldGradient.addColorStop(0, "#b5d983");
  fieldGradient.addColorStop(0.6, "#73a64d");
  fieldGradient.addColorStop(1, "#4e7d34");
  context.fillStyle = fieldGradient;
  roundRect(context, 360, 250, 660, 620, 10);
  context.fill();
  context.fillStyle = "#d6c581";
  context.fillRect(646, 250, 92, 620);
  drawPlayerSilhouette(context, 560, 332, 300, 430, "forty", submission.player);

  drawLogo(context, 438, 960, 48, submission.team, "#1f7a55");
  fitText(context, toTitleCase(submission.player), 700, 966, 450, 46, 900, "#0b0f19");

  context.fillStyle = "#ffffff";
  roundRect(context, 366, 1040, 310, 110, 4);
  context.fill();
  roundRect(context, 724, 1040, 290, 110, 4);
  context.fill();
  fitText(context, `${submission.batting.runs || "-"} (${submission.batting.balls || "-"})`, 520, 1078, 260, 38);
  fitText(context, `${submission.batting.fours || "0"}x4, ${submission.batting.sixes || "0"}x6`, 520, 1125, 260, 30);
  fitText(context, `${submission.bowling.wickets || "-"} WICKETS`, 870, 1078, 240, 36);
  fitText(context, `${submission.bowling.overs || "-"} OV (${submission.bowling.runs || "-"} RUNS)`, 870, 1125, 250, 28);

  context.fillStyle = "#1049a5";
  roundRect(context, 330, 1218, 332, 78, 9);
  context.fill();
  roundRect(context, 758, 1218, 292, 78, 9);
  context.fill();
  drawLogo(context, 338, 1257, 48, submission.homeTeam, "#c6a340");
  drawLogo(context, 1042, 1257, 48, submission.awayTeam, "#3069b6");
  context.fillStyle = "#ffffff";
  context.font = "900 25px Arial";
  context.textAlign = "left";
  context.fillText((submission.homeTeam || "Home team").toUpperCase(), 424, 1248);
  context.font = "800 23px Arial";
  context.fillText(submission.homeScore || "Score TBD", 424, 1278);
  context.textAlign = "right";
  context.font = "900 25px Arial";
  context.fillText((submission.awayTeam || "Away team").toUpperCase(), 1010, 1248);
  context.font = "800 23px Arial";
  context.fillText(submission.awayScore || "Score TBD", 1010, 1278);
  fitText(context, "VS", 710, 1264, 90, 66, 900, "#0b0f19");
  fitText(context, (submission.result || "Result pending").toUpperCase(), 690, 1330, 610, 28, 900, "#0b0f19");
}

export function downloadPostImage(submission) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  drawPost(context, submission);
  const link = document.createElement("a");
  link.download = `${submission.player.replace(/\s+/g, "-").toLowerCase()}-${submission.template}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
