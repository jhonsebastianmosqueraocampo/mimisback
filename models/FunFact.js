const { Schema, model } = require("mongoose");

const FunFactSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

module.exports = model("FunFact", FunFactSchema);
