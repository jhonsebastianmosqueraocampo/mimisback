const { Schema, model } = require("mongoose");

const ApiFootballCallSchema = new Schema(
  {
    /* =========================
       INFORMACIÓN GENERAL
    ========================== */

    endpoint: {
      type: String,
      required: true, // Ej: /fixtures, /players, /standings
    },

    method: {
      type: String,
      enum: ["GET", "POST"],
      default: "GET",
    },

    /* =========================
       CONTEXTO DE LA LLAMADA
    ========================== */

    source: {
      type: String,
      enum: ["manual", "cron", "system"],
      required: true,
      // manual → acción usuario
      // cron → tareas automáticas
      // system → procesos internos
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null, // null si es cron
    },

    /* =========================
       CONTROL DE COSTO
    ========================== */

    apiProvider: {
      type: String,
      default: "api-football",
    },

    costUnit: {
      type: Number,
      default: 1,
    },

    statusCode: {
      type: Number,
      required: true,
    },

    success: {
      type: Boolean,
      required: true,
    },

    responseTimeMs: {
      type: Number,
      default: null,
    },

    remainingRequests: {
      type: Number,
      default: null,
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = model("ApiFootballCall", ApiFootballCallSchema);
