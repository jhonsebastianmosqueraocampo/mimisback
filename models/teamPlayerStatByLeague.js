const { Schema, model } = require("mongoose");

const PlayerStatsSchema = new Schema({
  player: {
    id: Number,
    name: String,
    age: Number,
    number: Number,
    position: String,
    photo: String,
  },
  statistics: [
    {
      team: {
        id: Number,
        name: String,
        logo: String,
      },
      league: {
        id: Number,
        name: String,
        logo: String,
        country: String,
        flag: String,
        season: Number,
      },
      games: Object,
      substitutes: Object,
      shots: Object,
      goals: Object,
      passes: Object,
      tackles: Object,
      duels: Object,
      dribbles: Object,
      fouls: Object,
      cards: Object,
      penalty: Object,
    },
  ],
});

const TeamPlayerStatByLeagueSchema = new Schema({
  teamId: Number,
  leagueId: Number,
  season: Number,
  lastUpdate: Date,
  players: [PlayerStatsSchema],
});

module.exports = model("TeamPlayerStatByLeague", TeamPlayerStatByLeagueSchema);