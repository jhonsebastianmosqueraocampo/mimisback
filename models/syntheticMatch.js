const { Schema, model } = require("mongoose");

const syntheticMatchSchema = new Schema({
  matchNumber: { type: Number, required: true },
  score: String,
  date: { type: Date, default: Date.now },
});

module.exports = model("SyntheticMatch", syntheticMatchSchema);
