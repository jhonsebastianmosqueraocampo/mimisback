const axios = require("axios");
require("dotenv").config();
const League = require("../models/league");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const fetchLeaguesFromApi = async (country) => {
  try {
    const response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { country },
    });

    return response.data.response || [];
  } catch (error) {
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

const getLeagueFromCountry = async (country) => {
  try {
    const existing = await getLeaguesFromDb(country);
    if (existing.length > 0) return existing;

    const fromApi = await fetchLeaguesFromApi(country);
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
