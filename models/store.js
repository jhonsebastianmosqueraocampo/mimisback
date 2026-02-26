const { Schema, model } = require("mongoose");

const StoreSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "StoreUser",
      required: true,
    },
    name: { type: String, required: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    phone: String,
    image: String,
  },
  { timestamps: true },
);

StoreSchema.index({ location: "2dsphere" });

module.exports = model("Store", StoreSchema);
