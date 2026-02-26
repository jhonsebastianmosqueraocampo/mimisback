const { Schema, model, Types } = require("mongoose");

const WeekVideoSchema = new Schema(
  {
    video: { type: String, required: true },
    thumbail: { type: String, default: "" },
    user: {
      _id: { type: Types.ObjectId, ref: "User", required: false },
      name: { type: String },
    },
    fixture: {
      teamA: { type: String },
      teamB: { type: String },
    },
    views: { type: Number, default: 0 },
    favorites: {
      type: Number,
      default: 0,
    },
    likedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    week: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = model("SyntheticVideo", WeekVideoSchema);
