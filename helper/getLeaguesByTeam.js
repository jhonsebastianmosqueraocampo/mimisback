const axios = require("axios");
require("dotenv").config();
const TeamLeague = require("../models/teamLeague");

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_KEY;

const getLeaguesByTeam = async (teamId, season) => {
  if (!teamId || !season || isNaN(teamId) || isNaN(season)) {
    throw new Error("Invalid teamId or season");
  }

  // 1️⃣ Buscar en DB
  const existingLeagues = await TeamLeague.find({
    "team.id": teamId,
    season,
  }).sort({ lastUpdate: -1 });

  const now = new Date();
  const lastUpdate = existingLeagues[0]?.lastUpdate || null;
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 2️⃣ Verificar si necesita actualización (cada 1 día)
  if (existingLeagues.length > 0 && lastUpdate && lastUpdate > oneDayAgo) {
    return existingLeagues;
  }

  // 3️⃣ Consultar API-Football
  const response = await axios.get(`${API_URL}/leagues`, {
    headers: { "x-apisports-key": API_KEY },
    params: { team: teamId, season },
  });

  const leagues = response.data.response || [];

  if (!leagues.length) return [];

  const savedLeagues = [];

  // 4️⃣ Crear o actualizar sin borrar los registros anteriores
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
      lastUpdate: now,
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

    // pequeña espera entre iteraciones para evitar rate limit de DB
    await new Promise((r) => setTimeout(r, 150));
  }

  return savedLeagues;
};

module.exports = {
    getLeaguesByTeam
}