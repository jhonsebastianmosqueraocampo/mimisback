const { Schema, model } = require("mongoose");

const userBetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // referencia al usuario
    name: { type: String, required: true }, // nombre visible

    // selección según el tipo de apuesta
    selection: {
      pick: { type: String }, // para RESULT_1X2 ("LOCAL" | "DRAW" | "AWAY")
      home: { type: Number }, // para EXACT_SCORE
      away: { type: Number }, // para EXACT_SCORE
      side: { type: String }, // para OVER_UNDER ("OVER" | "UNDER")
      line: { type: Number }, // para OVER_UNDER
    },

    result: {
      type: String,
      enum: ["PENDING", "WIN", "LOSE", "VOID"],
      default: "PENDING",
    },
  },
  { _id: false },
);

const BetSchema = new Schema(
  {
    createdBy: {
      type: String,
      required: true,
    },
    fixtureId: {
      type: Number,
      required: true,
      index: true,
    },
    betType: {
      type: String,
      enum: ["RESULT_1X2", "EXACT_SCORE", "OVER_UNDER"], // 👈 solo tus tipos
      required: true,
    },
    stake: {
      type: Number,
      required: true,
    },
    accessCode: {
      type: String,
      unique: true,
      index: true,
    },
    users: [userBetSchema],
    winner: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isFinished: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: Boolean,
  },
  { timestamps: true },
);

module.exports = model("Bet", BetSchema, "bets");
