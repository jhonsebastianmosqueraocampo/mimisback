const { Schema, model } = require("mongoose");

const LeagueSchema = new Schema({
  league: {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    logo: { type: String }
  },
  country: {
    name: { type: String, required: true },
    code: { type: String },
    flag: { type: String }
  },
  lastUpdate: {
    type: Date,
    default: Date.now,
  },
});

module.exports = model("League", LeagueSchema, "leagues");