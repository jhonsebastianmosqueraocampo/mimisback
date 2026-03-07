const { Schema, model } = require("mongoose");

const TrendingItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["player", "team", "coach"],
      required: true,
      index: true,
    },

    itemId: {
      type: Number,
      required: true,
      index: true,
    },

    name: String,
    photo: String,
    nationality: String,
    teamName: String,
    teamLogo: String,

    searches: {
      type: Number,
      default: 1,
    },

    lastSearchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// evita duplicados
TrendingItemSchema.index({ type: 1, itemId: 1 }, { unique: true });

module.exports = model("TrendingItem", TrendingItemSchema);