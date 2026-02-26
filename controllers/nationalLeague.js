const axios = require("axios");
const NationalLeague = require("../models/nationalLeague.js");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getNationalLeagues = async (req, res) => {
  try {
    const now = new Date();

    // Buscar el último torneo SIN selección asociada (solo torneos globales)
    const lastLeague = await NationalLeague.findOne({ team: null })
      .sort({ updatedAt: -1 })
      .lean();

    // 🕐 Verificar si los datos en DB son recientes (<24h)
    if (lastLeague) {
      const hoursDiff = (now - new Date(lastLeague.updatedAt)) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        const leagues = await NationalLeague.find({ team: null })
          .sort({ "country.name": 1, name: 1 })
          .lean();

        // ✅ Formatear igual que el frontend espera
        const formatted = leagues.map((l) => ({
          leagueId: l.leagueId,
          name: l.name,
          type: l.type,
          logo: l.logo,
          country: l.country,
          seasons: l.seasons || [],
        }));

        return res.json({
          status: 'success',
          tournaments: formatted,
        });
      }
    }

    // 🛰️ Consultar API si no hay datos o están viejos
    const response = await axios.get(`${API_URL}/leagues?type=Cup`, {
      headers: { "x-apisports-key": API_KEY },
    });

    const allLeagues = response.data.response || [];

    // 🌍 Filtrar solo torneos de selecciones nacionales
    const nationalLeagues = allLeagues.filter((l) =>
      [
        "World",
        "Europe",
        "South America",
        "North America",
        "Africa",
        "Asia",
        "Oceania",
      ].includes(l.country.name)
    );

    // 💾 Guardar / actualizar en la base de datos
    for (const league of nationalLeagues) {
      await NationalLeague.findOneAndUpdate(
        { leagueId: league.league.id, team: null },
        {
          leagueId: league.league.id,
          name: league.league.name,
          type: league.league.type,
          logo: league.league.logo,
          country: league.country,
          seasons: league.seasons || [],
          team: null,
          updatedAt: now,
        },
        { upsert: true, new: true }
      );
    }

    // ✅ Formatear la respuesta al mismo formato que el frontend
    const formatted = nationalLeagues.map((l) => ({
      leagueId: l.league.id,
      name: l.league.name,
      type: l.league.type,
      logo: l.league.logo,
      country: l.country,
      seasons: l.seasons || [],
    }));

    return res.json({
      status: 'success',
      tournaments: formatted,
    });
  } catch (error) {
    return res.json({
      success: "error",
      message: "Error al obtener los torneos nacionales",
    });
  }
};

const getTournamentsFromCountry = async (req, res) => {
  const { country } = req.params;
  try {
    if (!country) {
      return res.json({
        status: "error",
        message: "Debes especificar el nombre del país (por ejemplo: Colombia)",
      });
    }

    // Buscar si ya hay registros recientes
    const existing = await NationalLeague.find({
      "team.country": new RegExp(`^${country}$`, "i"),
    }).lean();

    const now = new Date();
    const lastUpdated = existing.length
      ? Math.max(...existing.map((t) => new Date(t.updatedAt).getTime()))
      : null;

    const hoursDiff = lastUpdated
      ? (now - lastUpdated) / (1000 * 60 * 60)
      : Infinity;

    if (existing.length && hoursDiff < 24) {
      const leaguesWithCurrentSeason = existing.map((l) => ({
        ...l,
        seasons: l.seasons?.filter((s) => s.current) || [],
      }));
      return res.json({
        status: "success",
        tournaments: leaguesWithCurrentSeason,
      });
    }

    // Obtener ID de la selección
    const teamResponse = await axios.get(`${API_URL}/teams?name=${country}`, {
      headers: { "x-apisports-key": API_KEY },
    });

    const teamData = teamResponse.data.response.find((t) => t.team.national);
    if (!teamData) {
      return res.json({
        status: "error",
        message: `No se encontró una selección nacional llamada "${country}"`,
      });
    }

    const teamId = teamData.team.id;

    // Obtener torneos donde ha jugado la selección
    const leagueResponse = await axios.get(
      `${API_URL}/leagues?team=${teamId}`,
      {
        headers: { "x-apisports-key": API_KEY },
      }
    );

    const tournaments = leagueResponse.data.response.filter(
      (l) => l.league.type === "Cup"
    );

    if (!tournaments.length) {
      return res.json({
        status: "error",
        message: `No se encontraron torneos de selecciones para "${country}"`,
      });
    }

    // Guardar / actualizar en DB
    for (const league of tournaments) {
      await NationalLeague.findOneAndUpdate(
        { leagueId: league.league.id, "team.id": teamId },
        {
          name: league.league.name,
          type: league.league.type,
          logo: league.league.logo,
          country: league.country,
          team: {
            id: teamId,
            name: teamData.team.name,
            logo: teamData.team.logo,
            country: teamData.team.country,
            national: teamData.team.national,
          },
          seasons: league.seasons || [],
          updatedAt: now,
        },
        { upsert: true, new: true }
      );
    }

    const leaguesWithCurrentSeason = tournaments.map((l) => ({
      ...l,
      seasons: l.seasons?.filter((s) => s.current) || [],
    }));

    return res.json({
      status: "success",
      tournaments: leaguesWithCurrentSeason,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Ocurrió un error al obtener los torneos del país",
    });
  }
};

module.exports = {
  getNationalLeagues,
  getTournamentsFromCountry,
};
