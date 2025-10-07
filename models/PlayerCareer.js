const { Schema, model } = require("mongoose");

const CareerStatSchema = new Schema({
  league: {
    id: Number,
    name: String,
    country: String,
    season: Number,
  },
  team: {
    id: Number,
    name: String,
    logo: String,
  },
  games: {
    appearences: Number,
    lineups: Number,
    minutes: Number,
  },
  goals: {
    total: Number,
    assists: Number,
  },
  cards: {
    yellow: Number,
    red: Number,
  },
}, { _id: false });

const PlayerCareerSchema = Schema({
  playerId: { type: Number, required: true },
  name: String,
  nationality: String,
  photo: String,
  season: { type: Number, required: true },
  updatedAt: { type: Date, default: Date.now },
  history: [CareerStatSchema],
});

PlayerCareerSchema.index({ playerId: 1, season: 1 }, { unique: true });

module.exports = model("PlayerCareer", PlayerCareerSchema);