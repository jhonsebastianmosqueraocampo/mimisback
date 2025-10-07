const { Schema, model } = require('mongoose');

const PreMatchStatsSchema = Schema({
  fixtureId: { type: Number, required: true, unique: true },
  homeTeamId: Number,
  awayTeamId: Number,

  headToHead: Array,
  homeRecent: Array,
  awayRecent: Array,

  homeAverages: {
    possession: Number,
    shots: Number,
    passes: Number,
    goals: Number,
    assists: Number,
  },
  awayAverages: {
    possession: Number,
    shots: Number,
    passes: Number,
    goals: Number,
    assists: Number,
  },

  topScorers: {
    home: Array,
    away: Array,
  },
  topAssisters: {
    home: Array,
    away: Array,
  },

  lastUpdated: { type: Date, default: Date.now },
});

module.exports = model("PreMatchStats", PreMatchStatsSchema);