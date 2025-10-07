const { Schema, model } = require("mongoose");

const fixtureSchema = new Schema({
  fixtureId: Number,
  date: Date,
  leagueId: Number,
  season: Number,
  lastUpdate: {
    type: Date,
    default: Date.now
  },
  teams: {
    home: {
      id: Number,
      name: String,
      logo: String,
      winner: Boolean,
    },
    away: {
      id: Number,
      name: String,
      logo: String,
      winner: Boolean,
    },
  },
  league: {
    id: Number,
    name: String,
    country: String,
    logo: String,
    flag: String,
    season: { type: Number, index: true },
    round: String,
  },
  venue: {
    name: String,
    city: String,
  },
  referee: String,
  periods: {
    first: Number,
    second: Number,
  },
  status: {
    long: String,
    short: String,
    elapsed: Number,
  },
  goals: {
    home: Number,
    away: Number,
  },
  score: {
    halftime: {
      home: Number,
      away: Number,
    },
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

  notified: { type: Boolean, default: false },
});

module.exports = model("Fixture", fixtureSchema, "fixtures");
