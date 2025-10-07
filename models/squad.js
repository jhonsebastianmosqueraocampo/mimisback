const { Schema, model } = require("mongoose");

const playerSchema = new Schema({
  id: Number,
  name: String,
  age: Number,
  number: Number,
  position: String,
  photo: String
});

const squadSchema = new Schema({
  teamId: { type: Number, required: true, unique: true },
  teamName: String,
  teamLogo: String,
  players: [playerSchema],
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = model("Squad", squadSchema);