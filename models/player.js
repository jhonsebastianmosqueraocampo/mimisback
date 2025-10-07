const mongoose = require("mongoose");

const StatisticSchema = new mongoose.Schema({
  team: {
    id: Number,
    name: String,
    logo: String,
  },
  league: {
    id: Number,
    name: String,
    country: String,
    logo: String,
    flag: String,
    season: Number,
  },
  games: {
    appearences: Number,
    lineups: Number,
    minutes: Number,
    number: Number,
    position: String,
    rating: String,
    captain: Boolean,
  },
  substitutes: {
    in: Number,
    out: Number,
    bench: Number,
  },
  shots: {
    total: Number,
    on: Number,
  },
  goals: {
    total: Number,
    conceded: Number,
    assists: Number,
    saves: Number,
  },
  passes: {
    total: Number,
    key: Number,
    accuracy: String,
  },
  tackles: {
    total: Number,
    blocks: Number,
    interceptions: Number,
  },
  duels: {
    total: Number,
    won: Number,
  },
  dribbles: {
    attempts: Number,
    success: Number,
    past: Number,
  },
  fouls: {
    drawn: Number,
    committed: Number,
  },
  cards: {
    yellow: Number,
    yellowred: Number,
    red: Number,
  },
  penalty: {
    won: Number,
    commited: Number,
    scored: Number,
    missed: Number,
    saved: Number,
  },
});

const TeamPlayer = new mongoose.Schema({
  id: Number,
  name: String, 
  logo: String
})

const PlayerSchema = new mongoose.Schema(
  {
    playerId: { type: Number, required: true },
    firstname: String,
    lastname: String,
    name: { type: String, required: true },
    age: Number,
    birth: {
      date: String,
      place: String,
      country: String,
    },
    nationality: String,
    height: String,
    weight: String,
    injured: Boolean,
    photo: String,
    statistics: [StatisticSchema],
    team: TeamPlayer,
    cachedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Player", PlayerSchema, "players");
