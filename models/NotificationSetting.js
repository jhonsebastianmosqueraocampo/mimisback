const { Schema, model } = require("mongoose");

const NotificationSettingSchema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    teamMode: {
      type: String,
      enum: ["todos", "personalizado"],
      default: "todos",
    },

    teams: [
      {
        id: String,
        title: String,
        img: String,
      },
    ],

    playerMode: {
      type: String,
      enum: ["todos", "personalizado"],
      default: "todos",
    },

    players: [
      {
        id: String,
        title: String,
        img: String,
      },
    ],
  },
  { timestamps: true },
);

module.exports = model("NotificationSetting", NotificationSettingSchema);
