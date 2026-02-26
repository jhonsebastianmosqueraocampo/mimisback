const Team = require("../models/team");
const Favorite = require("../models/favorite");
const TeamPlayerStatByLeague = require("../models/TeamPlayerStatByLeague");
const Squad = require("../models/squad");
const axios = require("axios");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();

const { getLeaguesByTeam } = require("../helper/getLeaguesByTeam");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const teams = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);

  if (isNaN(leagueId) || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid leagueId or season" });
  }

  if (season == 0) {
    season = await getCurrentSeason({ leagueId: leagueId });
  }

  console.log(season)

  try {
    const existingTeams = await Team.find({ leagueId: Number(leagueId) });

    if (existingTeams.length > 0) {
      return res.json({
        status: "success",
        teams: existingTeams,
      });
    }

    // 2. Si no hay, hacer el request a la API
    const response = await axios.get(`${API_URL}/teams`, {
      headers: {
        "x-apisports-key": API_KEY,
      },
      params: {
        league: leagueId,
        season,
      },
    });

    if (!response.data.response || response.data.response.length === 0) {
      return res.json({ status: "error", message: "No teams found" });
    }

    const teams = response.data.response.map((t) => ({
      teamId: t.team.id,
      leagueId: Number(leagueId),
      name: t.team.name,
      logo: t.team.logo,
      country: t.team.country,
    }));

    await Team.insertMany(teams);

    return res.json({
      status: "success",
      teams,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getTeam = async (req, res) => {
  const userId = req.user.id;
  const teamId = parseInt(req.params.teamId, 10);

  if (isNaN(teamId) || !teamId) {
    return res.json({ status: "error", message: "Invalid teamId" });
  }

  try {
    let team = await Team.findOne({ teamId }).lean();

     // Buscar favoritos del usuario
    const favorites = await Favorite.findOne({ user: userId }).lean();

    if (team) {
      const isFavorite = favorites?.equipos?.includes(team?.name) || false;
      return res.json({ status: "success", team, isFavorite });
    }

    const { data } = await axios.get(`${API_URL}/teams`, {
      headers: {
        "x-apisports-key": API_KEY,
      },
      params: {
        id: teamId,
      },
    });

    const responseTeam = data.response?.[0];

    if (!responseTeam) {
      return res.json({ status: "error", message: "Team not found in API" });
    }

    const newTeam = await Team.create({
      teamId: responseTeam.team.id,
      name: responseTeam.team.name,
      country: responseTeam.team.country,
      logo: responseTeam.team.logo,
    });

    const newIsFavorite =
      favorites?.equipos?.includes(responseTeam.team.name) || false;

    return res.json({ status: "success", team: newTeam, isFavorite: newIsFavorite, });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getTeamPlayerStats = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  let season = parseInt(req.params.season, 10);
  if (isNaN(teamId) || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid parameters" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ teamId: teamId });
  }

  try {
    const leagues = await getLeaguesByTeam(teamId, season);

    if (!leagues || leagues.length === 0) {
      return res.json({ status: "success", stats: [] });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const allStats = [];

    for (const leagueObj of leagues) {
      const leagueId = leagueObj.league.id;

      let existingStats = await TeamPlayerStatByLeague.findOne({
        teamId,
        season,
        leagueId,
      });

      if (!existingStats || existingStats.lastUpdate < oneHourAgo) {
        const resPage1 = await axios.get(`${API_URL}/players`, {
          headers: { "x-apisports-key": API_KEY },
          params: {
            team: teamId,
            season,
            league: leagueId,
            page: 1,
          },
        });

        const resPage2 = await axios.get(`${API_URL}/players`, {
          headers: { "x-apisports-key": API_KEY },
          params: {
            team: teamId,
            season,
            league: leagueId,
            page: 2,
          },
        });

        const resPage3 = await axios.get(`${API_URL}/players`, {
          headers: { "x-apisports-key": API_KEY },
          params: {
            team: teamId,
            season,
            league: leagueId,
            page: 3,
          },
        });

        const resPage4 = await axios.get(`${API_URL}/players`, {
          headers: { "x-apisports-key": API_KEY },
          params: {
            team: teamId,
            season,
            league: leagueId,
            page: 4,
          },
        });

        const playerStats = [
          ...resPage1.data.response,
          ...resPage2.data.response,
          ...resPage3.data.response,
          ...resPage4.data.response,
        ];

        existingStats = await TeamPlayerStatByLeague.findOneAndUpdate(
          { teamId, season, leagueId },
          {
            teamId,
            season,
            leagueId,
            lastUpdate: now,
            players: playerStats,
          },
          { upsert: true, new: true }
        );
      }
      allStats.push(existingStats);
    }

    return res.json({
      status: "success",
      stats: allStats,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred. Please try again.",
    });
  }
};

const getTeamPlayerStatsByLeague = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  const leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);

  if (!teamId || !leagueId || !season) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid parameters" });
  }

  if (season === 0) {
    season = await getCurrentSeason({ leagueId: leagueId });
  }

  try {
    const existingStats = await TeamPlayerStatByLeague.findOne({
      teamId,
      leagueId,
      season,
    });
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (existingStats && existingStats.lastUpdate > oneDayAgo) {
      return res.json({
        status: "success",
        data: existingStats,
      });
    }

    const { data } = await axios.get(`${API_URL}/players`, {
      headers: { "x-apisports-key": API_KEY },
      params: {
        team: teamId,
        league: leagueId,
        season,
      },
    });

    const playerStats = data.response;

    const updatedDoc = await TeamPlayerStatByLeague.findOneAndUpdate(
      { teamId, leagueId, season },
      {
        teamId,
        leagueId,
        season,
        lastUpdate: new Date(),
        players: playerStats,
      },
      { upsert: true, new: true }
    );

    return res.json({
      status: "success",
      data: updatedDoc,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const getSquad = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);

  if (isNaN(teamId) || !teamId) {
    return res.json({ status: "error", message: "Invalid teamId" });
  }

  try {
    const existingSquad = await Squad.findOne({ teamId });

    if (existingSquad) {
      const daysSinceUpdate =
        (Date.now() - existingSquad.lastUpdated) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate < 10) {
        return res.json({
          status: "success",
          squad: existingSquad,
        });
      }
    }

    const { data } = await axios.get(
      `${API_URL}/players/squads?team=${teamId}`,
      {
        headers: { "x-apisports-key": API_KEY },
      }
    );

    if (!data.response || data.response.length === 0) {
      return res.json({
        status: "error",
        message: "No squad found for this team.",
      });
    }

    const squadData = data.response[0];
    const newSquad = {
      teamId: squadData.team.id,
      teamName: squadData.team.name,
      teamLogo: squadData.team.logo,
      players: squadData.players.map((p) => ({
        id: p.id,
        name: p.name,
        age: p.age,
        number: p.number,
        position: p.position,
        photo: p.photo,
      })),
      lastUpdated: Date.now(),
    };

    const updatedSquad = await Squad.findOneAndUpdate({ teamId }, newSquad, {
      upsert: true,
      new: true,
    });

    return res.json({
      status: "success",
      squad: updatedSquad,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred. Please try again.",
    });
  }
};

const search = async (req, res) => {
  try {
    const { name } = req.params;
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: 'error',
        message: "Nombre requerido",
      });
    }

    const queryName = name.trim().toLowerCase();
    const regex = new RegExp(escapeRegex(queryName), "i");
    const now = new Date();
    const TTL_HOURS = 24;

    // 1️⃣ Buscar en base de datos
    const localTeams = await Team.find({ name: regex })
      .select("teamId leagueId name logo country updatedAt")
      .lean();

    if (localTeams.length) {
      // 🧠 Calcular relevancia
      const scoredTeams = localTeams.map((t) => {
        const nameLower = t.name?.toLowerCase() || "";
        let score = 0;

        // Exact match
        if (nameLower === queryName) score += 10;

        // Palabras completas que coinciden
        if (nameLower.split(" ").includes(queryName)) score += 6;

        // Coincidencia parcial
        if (nameLower.includes(queryName)) score += 3;

        return { ...t, score };
      });

      // 🔹 Ordenar por relevancia y fecha de actualización
      scoredTeams.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });

      // 🔹 Verificar si los datos son recientes (<24h)
      const lastUpdated = Math.max(
        ...scoredTeams.map((t) => new Date(t.updatedAt || 0).getTime())
      );
      const hours = (now.getTime() - lastUpdated) / (1000 * 60 * 60);

      if (hours < TTL_HOURS) {
        return res.json({
          status: "success",
          teams: scoredTeams,
        });
      }
    }

    // 2️⃣ Consultar API-Football
    const apiUrl = `${API_URL}/teams?search=${encodeURIComponent(queryName)}`;
    const response = await axios.get(apiUrl, {
      headers: { "x-apisports-key": API_KEY },
    });

    const apiTeams = Array.isArray(response?.data?.response)
      ? response.data.response
      : [];

    if (!apiTeams.length) {
      return res.json({
        status: "error",
        message: `No se encontraron equipos para "${queryName}"`,
      });
    }

    // 3️⃣ Procesar resultados con sistema de score
    const cleanTeams = [];
    const seenIds = new Set();

    for (const item of apiTeams) {
      const t = item?.team;
      if (!t?.id || !t?.name || seenIds.has(t.id)) continue;
      seenIds.add(t.id);

      const nameLower = t.name?.toLowerCase() || "";
      let score = 0;
      if (nameLower === queryName) score += 10;
      if (nameLower.split(" ").includes(queryName)) score += 6;
      if (nameLower.includes(queryName)) score += 3;

      cleanTeams.push({
        teamId: t.id,
        name: t.name,
        logo: t.logo,
        country: t.country,
        leagueId: item?.league?.id || null,
        score,
      });
    }

    // 4️⃣ Ordenar por relevancia
    cleanTeams.sort((a, b) => b.score - a.score);

    // 5️⃣ Guardar / actualizar en BD
    for (const t of cleanTeams) {
      await Team.findOneAndUpdate(
        { teamId: t.teamId },
        { $set: t },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.json({
      status: "success",
      teams: cleanTeams,
    });
  } catch (error) {
    console.error(
      "❌ Error buscando equipos:",
      error?.response?.data || error.message
    );
    return res.status(500).json({
      status: "error",
      message: "Error al buscar equipos. Intenta de nuevo.",
    });
  }
};

const escapeRegex = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  teams,
  getTeam,
  getTeamPlayerStats,
  getTeamPlayerStatsByLeague,
  getSquad,
  search,
};
