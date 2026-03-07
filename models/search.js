const { Schema, model } = require("mongoose");

const SearchSchema = Schema({
  query: {
    type: String,
    required: true,
    unique: true,
  },

  players: {
    type: Array,
    default: [],
  },

  teams: {
    type: Array,
    default: [],
  },

  leagues: {
    type: Array,
    default: [],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = model("Search", SearchSchema);