const { Schema, model } = require("mongoose");

const TeamStandingSchema = new Schema({
  rank: Number,
  team: {
    id: Number,
    name: String,
    logo: String,
  },
  points: Number,
  goalsDiff: Number,
  group: String,
  form: String,
  status: String,
  description: String,
  all: {
    played: Number,
    win: Number,
    draw: Number,
    lose: Number,
    goals: {
      for: Number,
      against: Number,
    },
  },
  home: {
    played: Number,
    win: Number,
    draw: Number,
    lose: Number,
    goals: {
      for: Number,
      against: Number,
    },
  },
  away: {
    played: Number,
    win: Number,
    draw: Number,
    lose: Number,
    goals: {
      for: Number,
      against: Number,
    },
  },
  update: String,
});

const LeagueStandingSchema = new Schema({
  leagueId: Number,
  season: Number,
  league: {
    id: Number,
    name: String,
    country: String,
    logo: String,
    flag: String,
  },
  standings: [TeamStandingSchema],
  lastUpdate: {
    type: Date,
    default: Date.now,
  }
});

module.exports = model("LeagueStanding", LeagueStandingSchema, "leagueStandings");