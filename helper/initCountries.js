const axios = require("axios");
const Country = require("../models/country");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const initCountries = async () => {
  try {
    const count = await Country.countDocuments();

    // ✅ Si ya existen países, no gastar request
    if (count > 0) {
      return;
    }

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/countries`, {
        headers: {
          "x-apisports-key": API_KEY,
        },
      });

      await ApiFootballCall.create({
        endpoint: "/countries",
        method: "GET",
        source: "system-init",
        user: null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] ||
          response.headers?.["x-requests-remaining"] ||
          null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/countries",
        method: "GET",
        source: "system-init",
        user: null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] ||
          err.response?.headers?.["x-requests-remaining"] ||
          null,
        errorMessage: err.message,
      });

      return; // mantener tu comportamiento
    }

    const countries = response.data.response.map((c) => ({
      name: c.name,
      code: c.code,
      flag: c.flag,
    }));

    await Country.insertMany(countries);
  } catch (error) {
    console.error("❌ Error en initCountries:", error.message);
    return;
  }
};

module.exports = initCountries;
