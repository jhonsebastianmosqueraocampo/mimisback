const { Schema, model } = require("mongoose");

const seasonStatsSchema = new Schema(
  {
    season: { type: Number, required: true },
    team: {
      id: { type: Number, required: true },
      name: String,
      logo: String,
    },
    leagueId: Number,
    stats: {
      played: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      goalsFor: { type: Number, default: 0 },
      goalsAgainst: { type: Number, default: 0 },
      winRate: { type: String, default: "0%" },
    },
    cachedAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const coachSchema = new Schema(
  {
    coachId: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    firstname: String,
    lastname: String,
    age: Number,
    nationality: String,
    photo: String,
    history: [seasonStatsSchema],
  },
  { timestamps: true }
);

module.exports = model("Coach", coachSchema, "coaches");