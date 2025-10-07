const { Schema, model } = require("mongoose");

const FriendlyStandingSchema = new Schema({
  fixtureId: { type: Number, required: true, unique: true },
  referee: String,
  timezone: String,
  date: String,
  timestamp: Number,
  periods: {
    first: Number,
    second: Number,
  },
  venue: {
    id: Number,
    name: String,
    city: String,
  },
  status: {
    long: String,
    short: String,
    elapsed: Number,
    extra: String, // puede ser null o string
  },
  league: {
    id: Number,
    name: String,
    country: String,
    logo: String,
    flag: String,
    season: Number,
    round: String,
    standings: Boolean,
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
  goals: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  score: {
    halftime: {
      home: { type: Number, default: null },
      away: { type: Number, default: null },
    },
    fulltime: {
      home: { type: Number, default: null },
      away: { type: Number, default: null },
    },
    extratime: {
      home: { type: Number, default: null },
      away: { type: Number, default: null },
    },
    penalty: {
      home: { type: Number, default: null },
      away: { type: Number, default: null },
    },
  },
  lastUpdate: {
    type: Date,
    default: Date.now,
  },
});

module.exports = model("FriendlyStandingSchema", FriendlyStandingSchema);