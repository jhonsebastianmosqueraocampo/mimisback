const { Schema, model } = require("mongoose");

const PlayerStatSchema = new Schema(
  {
    playerId: { type: Number, required: true },
    name: { type: String, required: true },
    photo: { type: String, default: null },

    teamId: { type: Number, default: null },
    teamName: { type: String, default: "" },

    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    yellow: { type: Number, default: 0 },
    red: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    shotsTotal: { type: Number, default: 0 },
    shotsOn: { type: Number, default: 0 },
    keyPasses: { type: Number, default: 0 },
    passesTotal: { type: Number, default: 0 },
    dribblesSuccess: { type: Number, default: 0 },
    dribblesAttempts: { type: Number, default: 0 },
    tackles: { type: Number, default: 0 },
    interceptions: { type: Number, default: 0 },
    foulsDrawn: { type: Number, default: 0 },
    foulsCommitted: { type: Number, default: 0 },
    minutes: { type: Number, default: 0 }
  },
  { _id: false }
);

const LeagueStatsSchema = new Schema(
  {
    leagueId: { type: Number, required: true },
    season: { type: Number, required: true },

    topScorers: { type: [PlayerStatSchema], default: [] },
    topAssists: { type: [PlayerStatSchema], default: [] },
    topYellowCards: { type: [PlayerStatSchema], default: [] },
    topRedCards: { type: [PlayerStatSchema], default: [] },

    topRating: { type: [PlayerStatSchema], default: [] },
    topShotsTotal: { type: [PlayerStatSchema], default: [] },
    topShotsOn: { type: [PlayerStatSchema], default: [] },
    topKeyPasses: { type: [PlayerStatSchema], default: [] },
    topPassesTotal: { type: [PlayerStatSchema], default: [] },
    topDribblesSuccess: { type: [PlayerStatSchema], default: [] },
    topDribblesAttempts: { type: [PlayerStatSchema], default: [] },
    topTackles: { type: [PlayerStatSchema], default: [] },
    topInterceptions: { type: [PlayerStatSchema], default: [] },
    topFoulsDrawn: { type: [PlayerStatSchema], default: [] },
    topFoulsCommitted: { type: [PlayerStatSchema], default: [] },

    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = model("LeagueStats", LeagueStatsSchema);