export const STATUS_LABELS = {
  new: "New",
  verify: "Needs WCL check",
  ready: "Ready to post",
  posted: "Posted",
};

export const TEMPLATE_LABELS = {
  t20: "T20 poster",
  forty: "40 overs card",
};

export const SHEET_ID = "1W_HTrAllc7MPMJhmBFe-MWi30gCsYmNbZ0WkRsD5k_U";
export const SHEET_NAME = "Form Responses 1";

export const EMPTY_SUBMISSION = {
  id: "empty",
  status: "new",
  template: "t20",
  gameDate: "",
  ground: "",
  homeTeam: "",
  awayTeam: "",
  division: "",
  player: "",
  team: "",
  opponent: "",
  playerPhotoUrl: "",
  scorecardUrl: "",
  performanceDetails: "",
  batting: {
    runs: "",
    balls: "",
    fours: "",
    sixes: "",
    strikeRate: "",
  },
  bowling: {
    wickets: "",
    overs: "",
    runs: "",
  },
  homeScore: "",
  awayScore: "",
  result: "",
};

export const SAMPLE_SUBMISSIONS = [
  {
    id: 101,
    status: "verify",
    template: "t20",
    gameDate: "2026-05-30",
    ground: "Metro Oval",
    homeTeam: "Metro CC",
    awayTeam: "Jamaica CC",
    division: "Division II",
    player: "Roscoe Sinclair",
    team: "Metro CC",
    opponent: "Jamaica CC",
    playerPhotoUrl: "",
    scorecardUrl: "",
    performanceDetails:
      "54 runs from 41 balls, 1 four, 2 sixes. 2 overs, 11 runs, 1 wicket.",
    batting: {
      runs: "54",
      balls: "41",
      fours: "1",
      sixes: "2",
      strikeRate: "131.71",
    },
    bowling: {
      wickets: "1",
      overs: "2",
      runs: "11",
    },
    homeScore: "150/7 (20 OV)",
    awayScore: "110/9 (20 OV)",
    result: "Metro CC won by 40 runs",
  },
  {
    id: 102,
    status: "ready",
    template: "forty",
    gameDate: "2026-06-06",
    ground: "Veterans",
    homeTeam: "Mustangs CC",
    awayTeam: "Loudoun United CC",
    division: "Division III",
    player: "Hamza Shakeel",
    team: "Loudoun United CC",
    opponent: "Mustangs CC",
    playerPhotoUrl: "",
    scorecardUrl: "",
    performanceDetails:
      "144* from 89 balls with 17 fours and 7 sixes. 6 overs, 46 runs, 2 wickets.",
    batting: {
      runs: "144*",
      balls: "89",
      fours: "17",
      sixes: "7",
      strikeRate: "161.80",
    },
    bowling: {
      wickets: "2",
      overs: "6",
      runs: "46",
    },
    homeScore: "251/9 (40 OV)",
    awayScore: "254/3 (30.5 OV)",
    result: "Loudoun United CC won by 7 wickets",
  },
];
