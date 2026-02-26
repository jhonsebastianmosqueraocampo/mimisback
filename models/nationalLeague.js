const { Schema, model } = require("mongoose");

const SeasonSchema = new Schema({
  year: Number,
  start: String,
  end: String,
  current: Boolean,
});

const NationalLeagueSchema = new Schema({
  leagueId: { type: Number, required: true },
  name: String,
  type: String,
  logo: String,

  // Puede ser "World", "Europe", etc. o el país real ("Colombia", "Brasil")
  country: {
    name: String,
    code: String,
    flag: String,
  },

  // Info de la selección (solo si aplica)
  team: {
    id: { type: Number },
    name: { type: String },
    logo: { type: String },
    country: { type: String },
    national: { type: Boolean },
  },

  seasons: [SeasonSchema],
  updatedAt: { type: Date, default: Date.now },
});

// ✅ Evitar duplicados (mismo leagueId + mismo team.id)
NationalLeagueSchema.index({ leagueId: 1, "team.id": 1 }, { unique: true });

module.exports = model("NationalLeague", NationalLeagueSchema);