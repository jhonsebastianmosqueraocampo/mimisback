const { Schema, model } = require('mongoose');

const PlayerSeasonsSchema = new Schema(
  {
    playerId: { type: Number, required: true, unique: true, index: true },
    seasons: { type: [Number], default: [] },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = model('PlayerSeasons', PlayerSeasonsSchema);