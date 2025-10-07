const { Schema, model } = require("mongoose");

const groupStandingSchema = new Schema({
  leagueId: Number,
  season: Number,
  group: String,
  team: {
    id: Number,
    name: String,
    logo: String,
  },
  rank: Number,
  points: Number,
  all: {
    played: Number,
    win: Number,
    draw: Number,
    lose: Number,
    goals: { for: Number, against: Number },
  },
  lastUpdate: {
    type: Date,
    default: Date.now,
  },
});

module.exports = model("GroupStanding", groupStandingSchema, "groupStandings");