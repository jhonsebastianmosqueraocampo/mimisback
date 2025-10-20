const axios = require("axios");
const { getLeagueFromCountry } = require("../helper/getLeagueFromCountry");
const League = require("../models/league");
const TeamLeague = require("../models/teamLeague");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const leagues = async (req, res) => {
  try {
    const leagues = await League.find().lean();
    return res.json({
      status: "success",
      leagues,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const leaguesFromCountry = async (req, res) => {
  const { country } = req.params;
  try {
    const leagues = await getLeagueFromCountry(country);
    return res.json({
      status: "success",
      leagues,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const leaguesByTeam = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  let season = parseInt(req.params.season, 10);

  if (isNaN(teamId) || !teamId || isNaN(season) || !season) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid teamId or season" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ teamId: teamId });
  }

  try {
    // 1️⃣ Buscar ligas del equipo en la base de datos
    const existingLeagues = await TeamLeague.find({
      "team.id": teamId,
      season,
    }).sort({ lastUpdate: -1 });

    const now = dayjs();
    const lastUpdate = existingLeagues[0]?.lastUpdate
      ? dayjs(existingLeagues[0].lastUpdate)
      : null;

    // 2️⃣ Calcular si es necesario actualizar
    const shouldUpdate =
      !existingLeagues.length ||
      !lastUpdate ||
      now.diff(lastUpdate, "day") >= 1; // cada 1 día

    if (!shouldUpdate && existingLeagues.length > 0) {
      return res.json({
        status: "success",
        updated: false,
        leagues: existingLeagues,
      });
    }

    // 3️⃣ Consultar API-Football
    const response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamId, season },
    });

    const leagues = response.data.response || [];

    if (!leagues.length) {
      return res.status(404).json({
        status: "error",
        message: "No leagues found for this team and season",
      });
    }

    const savedLeagues = [];

    for (const item of leagues) {
      const data = {
        team: { id: teamId },
        league: {
          id: item.league.id,
          name: item.league.name,
          logo: item.league.logo,
          leagueType: item.league.type,
        },
        season,
        lastUpdate: new Date(),
      };

      const updated = await TeamLeague.findOneAndUpdate(
        {
          "team.id": teamId,
          season,
          "league.id": item.league.id,
        },
        { $set: data },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      savedLeagues.push(updated);

      // pequeña espera entre iteraciones (precaución ante rate limit)
      await new Promise((r) => setTimeout(r, 200));
    }

    return res.json({
      status: "success",
      updated: true,
      leagues: savedLeagues,
    });
  } catch (error) {
    console.error("❌ leaguesByTeam error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Error while fetching leagues. Try again later.",
    });
  }
};

const leagueById = async (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || !id) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid league id" });
  }

  try {
    // 1️⃣ Buscar liga en la BD
    const existingLeague = await League.findOne({ "league.id": id });

    const now = dayjs();
    const lastUpdated = existingLeague?.lastUpdate
      ? dayjs(existingLeague.lastUpdate)
      : null;

    // 2️⃣ Definir si se debe actualizar (cada 24 horas)
    const shouldUpdate =
      !existingLeague || !lastUpdated || now.diff(lastUpdated, "hour") >= 24;

    if (!shouldUpdate && existingLeague) {
      return res.json({
        status: "success",
        updated: false,
        league: existingLeague,
      });
    }

    console.log(`🔁 Actualizando datos de la liga ${id}...`);

    // 3️⃣ Consultar API-Football
    const response = await axios.get(`${API_URL}/leagues`, {
      headers: { "x-apisports-key": API_KEY },
      params: { id },
    });

    const result = response.data?.response?.[0];
    if (!result) {
      return res.status(404).json({
        status: "error",
        message: "No league found",
      });
    }

    const { league, country } = result;

    const objectLeague = {
      league,
      country,
      lastUpdate: new Date(),
    };

    // 4️⃣ Guardar o actualizar en DB
    await League.findOneAndUpdate({ "league.id": id }, objectLeague, {
      upsert: true,
      new: true,
    });

    return res.json({
      status: "success",
      updated: true,
      league: objectLeague,
    });
  } catch (error) {
    console.error("❌ leagueById error:", error.message);
    return res.json({
      status: "error",
      message: "Error fetching league data",
    });
  }
};

module.exports = {
  leagues,
  leaguesFromCountry,
  leaguesByTeam,
  leagueById,
};
