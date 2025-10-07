const axios = require("axios");
require("dotenv").config();
const Country = require("../models/country");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const initCountries = async () => {
  try {
    const count = await Country.countDocuments();
    if (count > 0) {
      return;
    }
    const response = await axios.get(`${API_URL}/countries`, {
      headers: {
        "x-apisports-key": API_KEY
      }
    });

    const countries = response.data.response.map((c) => ({
      name: c.name,
      code: c.code,
      flag: c.flag
    }));

    await Country.insertMany(countries);
  } catch (error) {
    return
  }
};

module.exports = initCountries;
