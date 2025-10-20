const { Schema, model } = require("mongoose");

const SeasonProgressSchema = new Schema(
  {
    matchday: Number,
    points: Number,
    opponent: String,
    result: String,
    score: String,
    date: String,
    position: Number,
  },
  { _id: false }
);

const TeamSummarySchema = new Schema(
  {
    leagueId: { type: Number, required: true },
    teamId: { type: Number, required: true },
    season: { type: Number, required: true },

    name: String,
    logoUrl: String,
    position: Number,
    points: Number,
    played: Number,
    wins: Number,
    draws: Number,
    losses: Number,
    goalsFor: Number,
    goalsAgainst: Number,

    recentForm: [String],

    topPlayer: {
      name: String,
      photo: String,
      goals: Number,
      assists: Number,
    },

    nextMatch: {
      opponent: String,
      date: String,
      home: Boolean,
    },

    seasonProgress: [SeasonProgressSchema],
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ índice compuesto único
TeamSummarySchema.index({ leagueId: 1, teamId: 1, season: 1 }, { unique: true });

module.exports = model("TeamSummary", TeamSummarySchema);