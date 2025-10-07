const { Schema, model } = require("mongoose");

const TeamLeagueSchema = new Schema({
  team: {
    id: Number,
  },
  league: {
    id: Number,
    name: String,
    logo: String,
    leagueType: String
  },
  season: Number,
  lastUpdate: {
    type: Date,
    default: Date.now,
  }
});

module.exports = model("TeamLeague", TeamLeagueSchema, "teamLeagues");