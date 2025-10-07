const { Schema, model } = require("mongoose");

const storedFixtureSchema = new Schema({
  fixtureId: { type: Number, unique: true },
  date: Date,
  referee: String,
  status: {
    long: String,
    short: String,
    elapsed: Number,
    extra: Number
  },
  venue: {
    id: Number,
    name: String,
    city: String,
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
    home: Number,
    away: Number,
  },
  league: {
    id: Number,
    name: String,
    season: Number,
    logo: String,
    round: String,
  },
});

module.exports = model("StoredFixture", storedFixtureSchema, "storedFixtures");