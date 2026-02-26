const axios = require("axios");
require("dotenv").config();
const League = require("../models/league");
const ApiFootballCall = require("../models/apifootballCals.js");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const fetchLeaguesFromApi = async (country, userId) => {
  const start = Date.now();

  try {
    const response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { country },
    });

    await ApiFootballCall.create({
      endpoint: "/leagues",
      method: "GET",
      source: userId ? "manual" : "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: response.status,
      success: true,
      responseTimeMs: Date.now() - start,
      remainingRequests:
        response.headers?.["x-ratelimit-requests-remaining"] || null,
    });

    return response.data?.response || [];
  } catch (error) {
    await ApiFootballCall.create({
      endpoint: "/leagues",
      method: "GET",
      source: userId ? "manual" : "system",
      user: userId || null,
      apiProvider: "api-football",
      costUnit: 1,
      statusCode: error.response?.status || 500,
      success: false,
      responseTimeMs: Date.now() - start,
      remainingRequests:
        error.response?.headers?.["x-ratelimit-requests-remaining"] || null,
      errorMessage: error.message,
    });

    return [];
  }
};

const saveLeaguesToDb = async (leagues) => {
  const saved = [];

  for (const item of leagues) {
    const data = {
      league: {
        id: item.league.id,
        name: item.league.name,
        type: item.league.type,
        logo: item.league.logo,
      },
      country: {
        name: item.country.name,
        code: item.country.code,
        flag: item.country.flag,
      },
    };

    const created = await League.create(data);
    saved.push(created.toObject());
  }

  return saved;
};

const getLeaguesFromDb = async (country) => {
  return await League.find({ "country.name": country }).lean();
};

const getLeagueFromCountry = async (country, userId) => {
  try {
    const existing = await getLeaguesFromDb(country);
    if (existing.length > 0) return existing;

    const fromApi = await fetchLeaguesFromApi(country, userId);
    if (fromApi.length === 0) return null;

    const saved = await saveLeaguesToDb(fromApi);
    return saved;
  } catch (error) {
    return null;
  }
};

module.exports = {
  getLeagueFromCountry,
};
