const { Schema, model } = require("mongoose");

const TeamSchema = new Schema({
  teamId: { type: Number, required: true, unique: true },
  leagueId: { type: Number },
  name: { type: String, required: true },
  logo: { type: String },
  country: { type: String }
});

module.exports = model("Team", TeamSchema, "teams");