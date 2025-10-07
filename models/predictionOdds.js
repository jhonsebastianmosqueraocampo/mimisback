const { Schema, model } = require("mongoose");

const predictionOddsSchema = new Schema({
  fixtureId: { type: Number, index: true, unique: true },
  leagueId: Number,
  season: Number,
  predictions: Schema.Types.Mixed, // respuesta raw de API-Football /predictions
  odds: Schema.Types.Mixed,        // respuesta raw de API-Football /odds
  lastUpdate: { type: Date, default: Date.now }
});

module.exports = model("PredictionOdds", predictionOddsSchema, "predictionsOdds");