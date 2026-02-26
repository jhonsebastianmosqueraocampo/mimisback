const { Schema, model } = require("mongoose");

const analysisSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["season", "fixture", "player"],
      required: true,
    },

    referenceId: {
      type: String,
      required: true, 
      index: true,
    },

    //Result ahora es un JSON COMPLETO, no un string
    result: {
      type: Schema.Types.Mixed, // <- CLAVE: permite objetos con charts, summary, etc.
      required: true,
    },

    //Las estadísticas crudas enviadas desde el frontend
    rawStats: {
      type: Schema.Types.Mixed,
      required: true,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Index compuesto para acelerar búsquedas por referencia + tipo
analysisSchema.index({ referenceId: 1, type: 1 });

module.exports = model("Analysis", analysisSchema);