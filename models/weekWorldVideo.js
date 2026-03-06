const { Schema, model } = require("mongoose");

const worldVideoSchema = new Schema(
  {
    week: { type: String, required: true },
    leagueName: { type: String, default: "" },
    thumbail: { type: String },
    video: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = model("WorldVideo", worldVideoSchema);