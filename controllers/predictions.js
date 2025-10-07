const Predictions = require("../models/prediction.js");
const Fixture = require("../models/fixture.js");
const PredictionOdds = require("../models/predictionOdds.js");
const axios = require("axios");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getFixturePrediction = async (req, res) => {
  const fixtureId = parseInt(req.params.fixtureId, 10);

  if (isNaN(fixtureId) || !fixtureId) {
    return res.json({ status: "error", message: "Invalid fixtureId" });
  }
  try {
    let prediction = await Predictions.findOne({ fixtureId });

    const now = new Date();
    const oneHour = 1000 * 60 * 60;

    if (prediction && now - prediction.lastUpdated < oneHour) {
      return res.json({ status: "success", prediction });
    }

    const { data } = await axios.get(`${API_URL}/predictions`, {
      params: { fixture: fixtureId },
      headers: {
        "x-apisports-key": API_KEY,
      },
    });

    const apiPrediction = data.response[0];

    if (!apiPrediction) {
      return res.json({ status: "error", message: "No prediction found" });
    }

    if (prediction) {
      prediction.set({
        ...apiPrediction,
        lastUpdated: now,
      });
      await prediction.save();
    } else {
      prediction = new Predictions({
        fixtureId,
        ...apiPrediction,
        lastUpdated: now,
      });
      await prediction.save();
    }

    return res.json({ status: "success", prediction });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

const getUpcomingPredictionsOdds = async (req, res) => {
  try {
    const tenMinutes = 1000 * 60 * 10;

    const now = new Date();
    const thirtyMinutesLater = new Date(now.getTime() + 3 * 30 * 60 * 1000);

    // 1. Traer fixtures próximos que aún no han finalizado
    const upcomingFixtures = await Fixture.find({
      "status.short": { $nin: ["FT", "AET", "PEN", "CANC"] },
      // fecha entre ahora y 30 minutos en adelante
      date: { $gte: now, $lte: thirtyMinutesLater },
    }).lean();

    if (!upcomingFixtures.length) {
      return res.json({
        status: "success",
        data: [],
        message: "No upcoming fixtures found",
      });
    }

    const results = [];

    for (const fixture of upcomingFixtures) {
      let record = await PredictionOdds.findOne({
        fixtureId: fixture.fixtureId,
      });

      const needsUpdate = !record || now - record.lastUpdate > tenMinutes;

      if (needsUpdate) {
        // 2. Llamadas a la API-Football
        const [predRes, oddsRes] = await Promise.all([
          axios.get(`${API_URL}/predictions`, {
            params: { fixture: fixture.fixtureId },
            headers: { "x-apisports-key": API_KEY },
          }),
          axios.get(`${API_URL}/odds`, {
            params: { fixture: fixture.fixtureId },
            headers: { "x-apisports-key": API_KEY },
          }),
        ]);

        const prediction = predRes.data.response[0] || null;
        const odds = oddsRes.data.response || [];

        if (record) {
          record.set({
            predictions: prediction,
            odds,
            lastUpdate: now,
          });
          await record.save();
        } else {
          record = new PredictionOdds({
            fixtureId: fixture.fixtureId,
            leagueId: fixture.leagueId,
            season: fixture.season,
            predictions: prediction,
            odds,
            lastUpdate: now,
          });
          await record.save();
        }
      }

      results.push({
        fixture,
        predictions: record.predictions,
        odds: record.odds,
        lastUpdate: record.lastUpdate,
      });
    }

    return res.json({
      status: "success",
      predictionodds: results,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error fetching predictions and odds",
    });
  }
};

module.exports = {
  getFixturePrediction,
  getUpcomingPredictionsOdds,
};
