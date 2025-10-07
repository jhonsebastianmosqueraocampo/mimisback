const { Schema, model } = require("mongoose");

const YoutubeCacheSchema = new Schema({
  query: { type: String, required: true, unique: true },
  videos: { type: Array, required: true },
  lastFetched: { type: Date, default: Date.now },
});

module.exports = model("YoutubeCache", YoutubeCacheSchema);