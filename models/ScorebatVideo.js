const { Schema, model } = require("mongoose");

const ScorebatVideoSchema = new Schema(
  {
    queryType: {
      type: String,
      enum: ["team", "fixture", "player", "tournament"],
      required: true,
    },
    queryValue: {
      type: String,
      required: true,
      trim: true,
    },
    videos: [
      {
        title: String,
        url: String, // URL del video principal
        thumbnail: String,
        competition: String,
        date: Date,
        side1: String, // equipo 1
        side2: String, // equipo 2
        embed: String, // código HTML embebido (iframe)
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = model("ScorebatVideo", ScorebatVideoSchema);