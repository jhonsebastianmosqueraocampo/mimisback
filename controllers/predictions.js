const Predictions = require("../models/prediction.js");
const Fixture = require("../models/fixture.js");
const PredictionOdds = require("../models/predictionOdds.js");
const { PRIORITY_LEAGUE_IDS } = require("../data/leaguesPriority");
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
    console.log(error);
    return res.json({
      status: "error",
      message: "An error was found",
    });
  }
};

const getUpcomingPredictionsOdds = async (req, res) => {
  try {
    const TEN_MINUTES = 1000 * 60 * 10;
    const THIRTY_MINUTES = 1000 * 60 * 30;
    const now = new Date();
    const thirtyMinutesLater = new Date(now.getTime() + THIRTY_MINUTES);

    // 1️⃣ Buscar fixtures próximos (entre ahora y los siguientes 90 min) que aún no han finalizado
    let upcomingFixtures = await Fixture.find({
      "status.short": { $nin: ["FT", "AET", "PEN", "CANC"] },
      date: { $gte: now, $lte: thirtyMinutesLater },
      leagueId: { $in: [...PRIORITY_LEAGUE_IDS] },
    }).lean();

    if (!upcomingFixtures.length) {
      return res.json({
        status: "success",
        data: [],
        message:
          "No hay partidos disponibles para predicción en los próximos 30 minutos. Vuelve más tarde.",
      });
    }

    const results = [];

    for (const fixture of upcomingFixtures) {
      let record = await PredictionOdds.findOne({
        fixtureId: fixture.fixtureId,
      });

      const needsUpdate = !record || now - record.lastUpdate > TEN_MINUTES;

      if (needsUpdate) {
        try {
          // 1️⃣ Predictions
          let prediction = null;
          try {
            const predRes = await axios.get(`${API_URL}/predictions`, {
              params: { fixture: fixture.fixtureId },
              headers: { "x-apisports-key": API_KEY },
              timeout: 10000,
            });

            prediction = predRes?.data?.response?.[0] ?? null;
          } catch (predError) {
            console.warn(
              `⚠️ Error predictions ${fixture.fixtureId}:`,
              predError.message,
            );
          }

          // 🔹 Pequeño delay opcional (evita rate limit agresivo)
          await new Promise((resolve) => setTimeout(resolve, 300));

          // 2️⃣ Odds
          let odds = [];
          try {
            const oddsRes = await axios.get(`${API_URL}/odds`, {
              params: { fixture: fixture.fixtureId },
              headers: { "x-apisports-key": API_KEY },
              timeout: 10000,
            });

            odds = oddsRes?.data?.response ?? [];
          } catch (oddsError) {
            console.warn(
              `⚠️ Error odds ${fixture.fixtureId}:`,
              oddsError.message,
            );
          }

          // 3️⃣ Guardar en DB
          if (record) {
            record.set({
              predictions: prediction,
              odds,
              lastUpdate: now,
            });

            await record.save();
          } else {
            record = await PredictionOdds.create({
              fixtureId: fixture.fixtureId,
              leagueId: fixture.leagueId,
              season: fixture.season,
              predictions: prediction,
              odds,
              lastUpdate: now,
            });
          }
        } catch (apiError) {
          console.warn(
            `⚠️ Error general API-Football ${fixture.fixtureId}:`,
            apiError.message,
          );
          continue;
        }
      }

      results.push({
        fixture,
        predictions: record?.predictions || null,
        odds: record?.odds || [],
        lastUpdate: record?.lastUpdate || now,
      });
    }

    return res.json({
      status: "success",
      predictionodds: results,
      message: "",
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error fetching predictions and odds",
    });
  }
};

module.exports = {
  getFixturePrediction,
  getUpcomingPredictionsOdds,
};
