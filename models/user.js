const { Schema, model } = require("mongoose");

const userSchema = new Schema({
  /* =========================
     IDENTIDAD
  ========================== */

  nickName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: String,
  role: {
    type: String,
    default: "user",
  },
  refreshToken: String,

  authProvider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },

  pushToken: String,

  lastLogin: { type: Date, default: null },
  lastActivity: { type: Date, default: null },

  /* =========================
     ECONOMÍA (SECUNDARIA)
  ========================== */

  points: { type: Number, default: 0 },

  redeemed: { type: Number, default: 0 },

  pointsHistory: [
    {
      action: { type: String },
      points: { type: Number },
      date: { type: Date, default: Date.now },
    },
  ],

  /* =========================
     PRESTIGIO
  ========================== */

  xp: { type: Number, default: 0 },

  level: {
    type: String,
    enum: ["Novato", "Intermedio", "Aficionado", "Leyenda"],
    default: "Novato",
  },

  /* =========================
     APUESTAS (EXPERIENCIA COMPETITIVA)
  ========================== */

  betsWon: { type: Number, default: 0 },
  betsLost: { type: Number, default: 0 },

  /* =========================
     COMUNIDAD
  ========================== */

  communityStats: {
    officialMatchesPlayed: { type: Number, default: 0 },
    newsPublished: { type: Number, default: 0 },
    highlightsUploaded: { type: Number, default: 0 },
    matchesRated: { type: Number, default: 0 },
  },

  reputation: { type: Number, default: 100 },

  badges: [{ type: String }],

  /* =========================
     ADS
  ========================== */

  limitAdsPerDay: { type: Number, default: 20 },
  lastAdsReset: { type: Date, default: Date.now },

  createdAt: { type: Date, default: Date.now },
});

// Método para calcular el nivel basado en xp y logros
userSchema.methods.calculateLevel = function () {
  const { xp, communityStats, reputation } = this;

  let level = "Novato";

  if (xp >= 1000) level = "Intermedio";

  if (xp >= 5000) level = "Aficionado";

  if (
    xp >= 10000 &&
    communityStats.officialMatchesPlayed >= 1 &&
    communityStats.newsPublished >= 5 &&
    communityStats.highlightsUploaded >= 10 &&
    communityStats.matchesRated >= 1
  ) {
    level = "Leyenda";
  }

  this.level = level;
  return level;
};

userSchema.methods.checkAndResetAdsLimit = function () {
  const now = new Date();
  const lastReset = new Date(this.lastAdsReset);

  const isNewDay =
    now.getFullYear() !== lastReset.getFullYear() ||
    now.getMonth() !== lastReset.getMonth() ||
    now.getDate() !== lastReset.getDate();

  if (isNewDay) {
    this.limitAdsPerDay = 20;
    this.lastAdsReset = now;
    return true;
  }

  return false;
};

module.exports = model("User", userSchema, "users");
