const { Schema, model } = require("mongoose");

const carouselPhotoSchema = new Schema(
  {
    foto: { type: String, required: true },
    url: { type: String, default: "" },
  },
  { _id: false }
);

const userNewSchema = new Schema(
  {
    user: {
      id: { type: Schema.Types.ObjectId, ref: "User", required: true },
      name: { type: String, required: true },
    },

    titulo: { type: String, required: true },
    entidad: { type: String, required: true },

    fotoPrincipal: { type: String, required: true },
    urlFotoPrincipal: { type: String, default: "" },

    desarrolloInicialNoticia: { type: String, required: true },

    carruselFotos: {
      type: [carouselPhotoSchema],
      default: [],
    },

    desarrolloFinalNoticia: { type: String, required: true },

    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = model("UserNew", userNewSchema);