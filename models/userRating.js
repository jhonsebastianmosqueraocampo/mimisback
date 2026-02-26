const { Schema, model } = require("mongoose");

const userRatingSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId, // 👈 referencia al ID de otro documento
    ref: "User", // 👈 nombre del modelo referenciado
    required: true,
  },
  fixtureId: Number,
  playerId: Number,
  rate: Number,
});

module.exports = model("UserRating", userRatingSchema);
