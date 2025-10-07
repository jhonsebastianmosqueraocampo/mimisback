const { Schema, model } = require("mongoose");

const userSchema = new Schema({
  nickName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true, // buena práctica para evitar duplicados
  },
  password: {
    type: String,
  },
  refreshToken: String,
  authProvider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },
  pushToken: String,

  // Puntos actuales (se pueden gastar)
  points: {
    type: Number,
    default: 0,
  },

  // Puntos de experiencia (histórico, nunca bajan)
  xp: {
    type: Number,
    default: 0,
  },

  // Nivel del usuario (se puede calcular, pero guardarlo ayuda a consultas rápidas)
  level: {
    type: String,
    enum: ["Novato", "Intermedio", "Avanzado", "Experto", "Leyenda"],
    default: "Novato",
  },

  // Stats de apuestas
  betsWon: { type: Number, default: 0 },
  betsLost: { type: Number, default: 0 },

  // Puntos ya redimidos (para estadísticas)
  redeemed: { type: Number, default: 0 },

  // Insignias desbloqueadas
  badges: [{ type: String }],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Método para calcular el nivel basado en xp y logros
userSchema.methods.calculateLevel = function () {
  const { xp, betsWon, betsLost, badges } = this;

  let level = "Novato";
  if (xp >= 1000) level = "Intermedio";
  if (xp >= 2500) level = "Avanzado";
  if (xp >= 5000) level = "Experto";
  if (xp >= 10000) level = "Leyenda";

  // Bonus: logros
  if (badges.includes("🏆 10 apuestas ganadas") && level !== "Leyenda") {
    level = "Experto";
  }

  // Bonus: winrate
  const total = betsWon + betsLost;
  const winRate = total > 0 ? (betsWon / total) * 100 : 0;
  if (winRate > 70 && level === "Intermedio") {
    level = "Avanzado";
  }

  this.level = level;
  return level;
};

module.exports = model("User", userSchema, "users");