const { Schema, model } = require("mongoose");

const favoriteSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
  equipos: [String],
  ligas: [String],
  jugadores: [String],
  entrenadores: [String],
}, { timestamps: true });

module.exports = model('Favorite', favoriteSchema, 'favorites');