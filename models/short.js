const { Schema, model } = require("mongoose");

const comentariosSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
    timestamps: true,
  },
);

const shortSchema = new Schema({
  thumbnail: {
    type: String,
    required: true,
  },
  video: {
    type: String,
    required: true,
  },
  fecha: {
    type: Date,
    default: Date.now,
  },
  descripcion: {
    type: String,
    default: "",
  },
  favoritos: {
    type: Number,
    default: 0,
  },
  likedBy: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  comentarios: {
    type: [comentariosSchema],
    default: [],
  },
});

module.exports = model("Short", shortSchema, "shorts");
