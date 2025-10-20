const { Schema, model } = require("mongoose");

const PlayerSchema = new Schema({
  id: Number,
  name: String,
  number: Number,
  pos: String,
  grid: String,
  photo: { type: String, default: "" },
});

const TeamLineupSchema = new Schema({
  team: {
    id: Number,
    name: String,
    logo: String,
    coach: {
      id: Number,
      name: String,
      photo: String,
    },
    formation: String,
  },
  startXI: [PlayerSchema],
  substitutes: [PlayerSchema],
});

const LineupSchema = new Schema({
  fixtureId: { type: Number, required: true, unique: true },
  lineups: [TeamLineupSchema],
  lastUpdated: { type: Date, default: Date.now },
});

module.exports = model("Lineup", LineupSchema);
