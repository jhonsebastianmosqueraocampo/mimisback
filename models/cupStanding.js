const { Schema, model } = require("mongoose");

const cupStandingSchema = new Schema({
  leagueId: Number,
  season: Number,
  round: String,
  date: Date,
  homeTeam: {
    id: Number,
    name: String,
    logo: String,
  },
  awayTeam: {
    id: Number,
    name: String,
    logo: String,
  },
  goals: {
    home: Number,
    away: Number,
  },
  score: {
    fulltime: {
      home: Number,
      away: Number,
    },
    extratime: {
      home: Number,
      away: Number,
    },
    penalty: {
      home: Number,
      away: Number,
    },
  },
  status: String,
  lastUpdate: {
    type: Date,
    default: Date.now
  }
});

module.exports = model("CupStanding", cupStandingSchema, "cupStandings");