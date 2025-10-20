// models/SeasonCache.js
const mongoose = require("mongoose");

const SeasonCacheSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  season: Number,
  lastUpdated: Date,
});

module.exports = mongoose.model("SeasonCache", SeasonCacheSchema);