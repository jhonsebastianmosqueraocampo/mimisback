const axios = require("axios");
const NationalLeague = require("../models/nationalLeague.js");
const ApiFootballCall = require("../models/apifootballCals.js");
require("dotenv").config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const getNationalLeagues = async (req, res) => {
  try {
    const now = new Date();
    const userId = req.user.id;

    // Buscar el último torneo SIN selección asociada (solo torneos globales)
    const lastLeague = await NationalLeague.findOne({ team: null })
      .sort({ updatedAt: -1 })
      .lean();

    // Verificar si los datos en DB son recientes (<24h)
    if (lastLeague) {
      const hoursDiff =
        (now - new Date(lastLeague.updatedAt)) / (1000 * 60 * 60);

      if (hoursDiff < 24) {
        const leagues = await NationalLeague.find({ team: null })
          .sort({ "country.name": 1, name: 1 })
          .lean();

        const formatted = leagues.map((l) => ({
          leagueId: l.leagueId,
          name: l.name,
          type: l.type,
          logo: l.logo,
          country: l.country,
          seasons: l.seasons || [],
        }));

        return res.json({
          status: "success",
          tournaments: formatted,
        });
      }
    }

    /* ===========================
       LLAMADO A API-FOOTBALL
    ============================ */

    const start = Date.now();
    let response;

    try {
      response = await axios.get(`${API_URL}/leagues`, {
        headers: { "x-apisports-key": API_KEY },
        params: { type: "Cup" },
      });

      await ApiFootballCall.create({
        endpoint: "/leagues",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          response.headers?.["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/leagues",
        method: "GET",
        source: "manual",
        user: userId || null,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - start,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.json({
        success: "error",
        message: "Error al consultar torneos en API-Football",
      });
    }

    const allLeagues = response.data?.response || [];

    // Filtrar solo torneos de selecciones nacionales
    const nationalLeagues = allLeagues.filter((l) =>
      [
        "World",
        "Europe",
        "South America",
        "North America",
        "Africa",
        "Asia",
        "Oceania",
      ].includes(l?.country?.name),
    );

    // Guardar / actualizar en la base de datos
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
        { upsert: true, new: true },
      );
    }

    // Formatear respuesta
    const formatted = nationalLeagues.map((l) => ({
      leagueId: l.league.id,
      name: l.league.name,
      type: l.league.type,
      logo: l.league.logo,
      country: l.country,
      seasons: l.seasons || [],
    }));

    return res.json({
      status: "success",
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

    const userId = req.user?.id || null;

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

    /* ===========================
       🔹 1) /teams (buscar selección)
    ============================ */

    const startTeams = Date.now();
    let teamResponse;

    try {
      teamResponse = await axios.get(`${API_URL}/teams`, {
        headers: { "x-apisports-key": API_KEY },
        params: { name: country },
      });

      await ApiFootballCall.create({
        endpoint: "/teams",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: teamResponse.status,
        success: true,
        responseTimeMs: Date.now() - startTeams,
        remainingRequests:
          teamResponse.headers?.["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/teams",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - startTeams,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.json({
        status: "error",
        message: "Error consultando la selección en API-Football",
      });
    }

    const teamData = (teamResponse.data?.response || []).find(
      (t) => t?.team?.national,
    );

    if (!teamData) {
      return res.json({
        status: "error",
        message: `No se encontró una selección nacional llamada "${country}"`,
      });
    }

    const teamId = teamData.team.id;

    /* ===========================
       🔹 2) /leagues (torneos por team)
    ============================ */

    const startLeagues = Date.now();
    let leagueResponse;

    try {
      leagueResponse = await axios.get(`${API_URL}/leagues`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId },
      });

      await ApiFootballCall.create({
        endpoint: "/leagues",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: leagueResponse.status,
        success: true,
        responseTimeMs: Date.now() - startLeagues,
        remainingRequests:
          leagueResponse.headers?.["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/leagues",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - startLeagues,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.json({
        status: "error",
        message: "Error consultando torneos en API-Football",
      });
    }

    const tournaments = (leagueResponse.data?.response || []).filter(
      (l) => l?.league?.type === "Cup",
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
        { upsert: true, new: true },
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
