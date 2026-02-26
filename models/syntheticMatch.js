const { Schema, model } = require("mongoose");

const TeamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }
  },
  { _id: false },
);

const LocationSchema = new Schema(
  {
    city: { type: String, trim: true },
    field: { type: String, trim: true },
    address: { type: String, trim: true },
    mapsUrl: { type: String, trim: true },
  },
  { _id: false },
);

const ScoreSchema = new Schema(
  {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  { _id: false },
);

const syntheticMatchSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },

    status: {
      type: String,
      enum: ["invitation", "scheduled", "rejected", "cancelled", "finished"],
      default: "invitation",
      index: true,
    },

    rejectionReason: { type: String },

    homeTeam: { type: TeamSchema },
    awayTeam: { type: TeamSchema },
    scheduledAt: { type: Date, index: true },
    location: { type: LocationSchema },
    liveUrl: { type: String },

    score: {
      type: ScoreSchema,
      default: () => ({ home: null, away: null }),
    },

    youtubeUrl: { type: String },
  },
  { timestamps: true },
);

module.exports = model("SyntheticMatch", syntheticMatchSchema);
