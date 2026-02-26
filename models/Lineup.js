const { Schema, model } = require("mongoose");

const PlayerSchema = new Schema(
  {
    id: Number,
    name: String,
    number: Number,
    pos: String,
    grid: String,
    photo: { type: String, default: "" },
    rating: { type: Number, default: null },
    minutes: { type: Number, default: null },
  },
  { _id: false },
);

const TeamLineupSchema = new Schema(
  {
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
  },
  { _id: false },
);

const LineupSchema = new Schema({
  fixtureId: { type: Number, required: true, unique: true },
  lineups: [TeamLineupSchema],
  hasLineup: { type: Boolean, default: false },
  ratingsLastUpdated: { type: Date, default: null },
  ratingsFinal: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now },
});

module.exports = model("Lineup", LineupSchema);
