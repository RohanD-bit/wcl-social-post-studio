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
  let fittedText = String(text ?? "");
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  do {
    context.font = `${weight} ${size}px Arial`;
    if (context.measureText(fittedText).width <= maxWidth) break;
    size -= 2;
  } while (size >= 18);
  while (context.measureText(fittedText).width > maxWidth && fittedText.length > 4) {
    fittedText = `${fittedText.slice(0, -4).trimEnd()}...`;
  }
  context.fillText(fittedText, x, y);
}

function splitLongWord(context, word, maxWidth) {
  const parts = [];
  let current = "";
  for (const char of word) {
    const next = `${current}${char}`;
    if (current && context.measureText(next).width > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function wrapText(context, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    if (context.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(...splitLongWord(context, word, maxWidth));
      return;
    }

    const next = current ? `${current} ${word}` : word;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines;
}

function fitTextBlock(context, text, x, y, width, height, startSize, minSize, maxLines, weight = 900, color = "#0f172a") {
  let size = startSize;
  let lines = [];

  while (size >= minSize) {
    context.font = `${weight} ${size}px Arial`;
    lines = wrapText(context, text, width);
    const lineHeight = size * 1.08;
    if (lines.length <= maxLines && lines.length * lineHeight <= height) break;
    size -= 2;
  }

  context.font = `${weight} ${size}px Arial`;
  lines = wrapText(context, text, width).slice(0, maxLines);
  if (lines.length === maxLines) {
    while (context.measureText(`${lines[lines.length - 1]}...`).width > width && lines[lines.length - 1].length > 3) {
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1).trimEnd();
    }
    if (wrapText(context, text, width).length > maxLines) {
      lines[lines.length - 1] = `${lines[lines.length - 1]}...`;
    }
  }

  const lineHeight = size * 1.08;
  const firstY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    context.fillText(line, x + width / 2, firstY + index * lineHeight);
  });
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

function drawT20StatCard(context, label, value, x, y, width, height) {
  context.save();
  context.fillStyle = "rgba(7, 24, 46, 0.72)";
  roundRect(context, x, y, width, height, 10);
  context.fill();
  context.strokeStyle = "#2aa8ef";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(x + 18, y + 18);
  context.lineTo(x + width - 18, y + 18);
  context.stroke();
  context.fillStyle = "#2aa8ef";
  context.font = "900 23px Arial";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(label.toUpperCase(), x + 22, y + 54);
  fitText(context, String(value || "-"), x + width / 2, y + height * 0.66, width - 36, 56, 900, "#ffffff");
  context.restore();
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

  drawLogo(context, 86, 86, 50, "WCL", "#c2413f");
  context.fillStyle = "rgba(255,255,255,0.5)";
  context.font = "900 46px Arial";
  context.textAlign = "left";
  context.fillText("WCL T20", 158, 96);
  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = "900 28px Arial";
  context.textAlign = "right";
  context.fillText((submission.division || "Division TBD").toUpperCase(), 1010, 96);

  context.fillStyle = "#ffffff";
  context.font = "900 108px Arial";
  context.textAlign = "left";
  context.fillText("PLAYER", 72, 250);
  context.fillText("OF THE", 72, 354);
  context.fillText("MATCH", 72, 458);

  drawPlayerSilhouette(context, 650, 188, 348, 500, "t20", submission.player);

  context.save();
  context.translate(72, 548);
  context.transform(1, 0, -0.12, 1, 0, 0);
  context.fillStyle = "#1594ed";
  roundRect(context, 0, 0, 560, 96, 8);
  context.fill();
  fitText(context, toTitleCase(submission.player), 280, 50, 500, 44, 900, "#ffffff");
  context.restore();

  const statY = 725;
  const statWidth = 218;
  const statGap = 20;
  drawT20StatCard(context, "Runs", submission.batting.runs, 72, statY, statWidth, 142);
  drawT20StatCard(context, "Balls", submission.batting.balls, 72 + (statWidth + statGap), statY, statWidth, 142);
  drawT20StatCard(context, "Wickets", submission.bowling.wickets, 72 + (statWidth + statGap) * 2, statY, statWidth, 142);
  drawT20StatCard(context, "Overs", submission.bowling.overs, 72 + (statWidth + statGap) * 3, statY, statWidth, 142);

  context.save();
  context.translate(72, 925);
  context.transform(1, 0, -0.1, 1, 0, 0);
  context.fillStyle = "#1594ed";
  roundRect(context, 0, 0, 620, 78, 8);
  context.fill();
  fitText(context, (submission.result || "Result pending").toUpperCase(), 310, 40, 560, 32, 900, "#ffffff");
  context.restore();

  context.fillStyle = "#1585d6";
  roundRect(context, 104, 1138, 374, 78, 10);
  context.fill();
  roundRect(context, 602, 1138, 374, 78, 10);
  context.fill();
  drawLogo(context, 100, 1177, 50, submission.homeTeam, "#a3a337");
  drawLogo(context, 980, 1177, 50, submission.awayTeam, "#2f8a55");
  context.fillStyle = "#ffffff";
  context.font = "900 26px Arial";
  context.textAlign = "left";
  context.fillText((submission.homeTeam || "Home team").toUpperCase(), 184, 1168);
  context.font = "800 24px Arial";
  context.fillText(submission.homeScore || "Score TBD", 184, 1202);
  context.textAlign = "right";
  context.font = "900 26px Arial";
  context.fillText((submission.awayTeam || "Away team").toUpperCase(), 896, 1168);
  context.font = "800 24px Arial";
  context.fillText(submission.awayScore || "Score TBD", 896, 1202);
  context.fillStyle = "#ffffff";
  context.font = "900 68px Arial";
  context.textAlign = "center";
  context.fillText("VS", 540, 1194);
  context.font = "900 28px Arial";
  context.fillText(
    `${formatDate(submission.gameDate).toUpperCase()}  |  ${(submission.ground || "Venue TBD").toUpperCase()}`,
    540,
    1298,
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

  drawLogo(context, 438, 962, 48, submission.team, "#1f7a55");
  fitTextBlock(context, toTitleCase(submission.player), 500, 916, 500, 96, 46, 22, 3, 900, "#0b0f19");

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
