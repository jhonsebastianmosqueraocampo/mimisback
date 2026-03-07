const axios = require("axios");
const Coach = require("../models/coach");
const Team = require("../models/team");
const ApiFootballCall = require("../models/apifootballCals.js");
const { getCurrentSeason } = require("../helper/getCurrentSeason.js");
require("dotenv").config();
const { registerSearch } = require('../helper/registerTrendingItem.js');

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const getCoachesByLeague = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  let season = parseInt(req.params.season, 10);
  if (isNaN(leagueId) || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid parameters" });
  }

  const userId = req.user.id;

  if (season === 0) {
    season = await getCurrentSeason({ leagueId: leagueId, userId });
  }

  try {
    const existingCoaches = await Coach.aggregate([
      {
        $match: {
          history: {
            $elemMatch: { leagueId, season },
          },
        },
      },
      {
        $project: {
          coachId: 1,
          name: 1,
          firstname: 1,
          lastname: 1,
          age: 1,
          nationality: 1,
          photo: 1,
          history: {
            $filter: {
              input: "$history",
              as: "h",
              cond: {
                $and: [
                  { $eq: ["$$h.leagueId", leagueId] },
                  { $eq: ["$$h.season", season] },
                ],
              },
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    if (existingCoaches.length > 0) {
      return res.json({ status: "success", coaches: existingCoaches });
    }

    let teams = await Team.find({ leagueId });
    if (teams.length === 0) {
      let teamsRes;
      const startTeams = Date.now();

      try {
        teamsRes = await axios.get(`${API_URL}/teams`, {
          headers: { "x-apisports-key": API_KEY },
          params: { league: leagueId, season },
        });

        await ApiFootballCall.create({
          endpoint: "/teams",
          method: "GET",
          source: "manual",
          user: userId,
          apiProvider: "api-football",
          costUnit: 1,
          statusCode: teamsRes.status,
          success: true,
          responseTimeMs: Date.now() - startTeams,
          remainingRequests:
            teamsRes.headers["x-ratelimit-requests-remaining"] || null,
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

        throw err;
      }

      const apiTeams = teamsRes.data.response || [];
      if (apiTeams.length === 0) {
        return res.json({
          status: "error",
          message: "No teams found for this league/season",
        });
      }

      const teamDocs = apiTeams.map((t) => ({
        teamId: t.team.id,
        name: t.team.name,
        logo: t.team.logo,
        country: t.team.country,
        leagueId: leagueId,
      }));

      await Team.insertMany(teamDocs);
      teams = teamDocs;
    }

    for (const team of teams) {
      const teamId = team.teamId;

      try {
        const startCoach = Date.now();
        let coachRes;
        let coachList = [];
        try {
          coachRes = await axios.get(`${API_URL}/coachs`, {
            headers: { "x-apisports-key": API_KEY },
            params: { team: teamId },
          });

          await ApiFootballCall.create({
            endpoint: "/coachs",
            method: "GET",
            source: "manual",
            user: userId,
            apiProvider: "api-football",
            costUnit: 1,
            statusCode: coachRes.status,
            success: true,
            responseTimeMs: Date.now() - startCoach,
            remainingRequests:
              coachRes.headers["x-ratelimit-requests-remaining"] || null,
          });

          coachList = coachRes.data.response || [];
        } catch (err) {
          await ApiFootballCall.create({
            endpoint: "/coachs",
            method: "GET",
            source: "manual",
            user: userId,
            apiProvider: "api-football",
            costUnit: 1,
            statusCode: err.response?.status || 500,
            success: false,
            responseTimeMs: Date.now() - startCoach,
            remainingRequests:
              err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
            errorMessage: err.message,
          });

          console.error(
            "Error fetching coach for team:",
            teamId,
            err?.response?.data || err.message,
          );

          continue;
        }

        const currentCoach = coachList.find((coach) =>
          coach.career?.some(
            (c) =>
              c.team?.id === teamId && (c.end === null || c.end === undefined),
          ),
        );

        if (!currentCoach) continue;

        const now = new Date();

        let coachDoc = await Coach.findOne({ coachId: currentCoach.id });

        const entryIndex =
          coachDoc?.history.findIndex(
            (h) => h.season === season && h.team?.id === teamId,
          ) ?? -1;

        if (!coachDoc) {
          coachDoc = await Coach.create({
            coachId: currentCoach.id,
            name: currentCoach.name,
            firstname: currentCoach.firstname,
            lastname: currentCoach.lastname,
            age: currentCoach.age,
            nationality: currentCoach.nationality,
            photo: currentCoach.photo,
            history: [
              {
                season,
                team: { id: teamId, name: team.name, logo: team.logo },
                leagueId,
                cachedAt: now,
                lastUpdated: now,
              },
            ],
          });
        } else {
          coachDoc.name = currentCoach.name;
          coachDoc.firstname = currentCoach.firstname;
          coachDoc.lastname = currentCoach.lastname;
          coachDoc.age = currentCoach.age;
          coachDoc.nationality = currentCoach.nationality;
          coachDoc.photo = currentCoach.photo;

          if (entryIndex >= 0) {
            coachDoc.history[entryIndex].team.name = team.name;
            coachDoc.history[entryIndex].team.logo = team.logo;
            coachDoc.history[entryIndex].leagueId = leagueId;
            coachDoc.history[entryIndex].cachedAt = now;
            coachDoc.history[entryIndex].lastUpdated = now;
          } else {
            coachDoc.history.push({
              season,
              team: { id: teamId, name: team.name, logo: team.logo },
              leagueId,
              cachedAt: now,
              lastUpdated: now,
            });
          }

          await coachDoc.save();
        }
      } catch (err) {
        console.error(
          "Error fetching coach for team:",
          teamId,
          err?.response?.data || err.message,
        );
      }
    }

    const coaches = await Coach.aggregate([
      {
        $match: {
          history: {
            $elemMatch: { leagueId, season },
          },
        },
      },
      {
        $project: {
          coachId: 1,
          name: 1,
          firstname: 1,
          lastname: 1,
          age: 1,
          nationality: 1,
          photo: 1,
          history: {
            $filter: {
              input: "$history",
              as: "h",
              cond: {
                $and: [
                  { $eq: ["$$h.leagueId", leagueId] },
                  { $eq: ["$$h.season", season] },
                ],
              },
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    return res.json({ status: "success", coaches });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to fetch or store coaches",
    });
  }
};

const getCoachByTeam = async (req, res) => {
  const CACHE_DAYS_LIMIT = 1;
  const teamId = parseInt(req.params.teamId, 10);
  const userId = req.user?.id || null;

  if (isNaN(teamId) || !teamId) {
    return res.status(400).json({ status: "error", message: "Invalid teamId" });
  }

  try {
    const existingCoach = await Coach.findOne({
      "history.team.id": teamId,
    });

    if (existingCoach) {
      const historyEntry = existingCoach.history.find(
        (h) => h.team.id === teamId,
      );

      if (historyEntry) {
        const diffDays =
          (Date.now() - new Date(historyEntry.cachedAt)) /
          (1000 * 60 * 60 * 24);

        if (diffDays < CACHE_DAYS_LIMIT) {
          return res.json({
            status: "success",
            coach: {
              coachId: existingCoach.coachId,
              name: existingCoach.name,
              firstname: existingCoach.firstname,
              lastname: existingCoach.lastname,
              age: existingCoach.age,
              nationality: existingCoach.nationality,
              photo: existingCoach.photo,
              history: [historyEntry],
            },
          });
        }
      }
    }

    /* ================= API CALL ================= */

    const startCoach = Date.now();
    let coachRes;

    try {
      coachRes = await axios.get(`${API_URL}/coachs`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId },
      });

      await ApiFootballCall.create({
        endpoint: "/coachs",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: coachRes.status,
        success: true,
        responseTimeMs: Date.now() - startCoach,
        remainingRequests:
          coachRes.headers["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/coachs",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - startCoach,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.status(500).json({
        status: "error",
        message: "Failed to fetch coach from API",
      });
    }

    const coachList = coachRes.data.response || [];

    const currentCoach = coachList.find((coach) =>
      coach.career?.some(
        (c) => c.team?.id === teamId && (c.end === null || c.end === undefined),
      ),
    );

    if (!currentCoach) {
      return res.status(404).json({
        status: "error",
        message: "No active coach found for this team",
      });
    }

    const now = new Date();

    let coachDoc = await Coach.findOne({ coachId: currentCoach.id });

    if (!coachDoc) {
      coachDoc = await Coach.create({
        coachId: currentCoach.id,
        name: currentCoach.name,
        firstname: currentCoach.firstname,
        lastname: currentCoach.lastname,
        age: currentCoach.age,
        nationality: currentCoach.nationality,
        photo: currentCoach.photo,
        history: [
          {
            season: new Date().getFullYear(),
            team: {
              id: teamId,
              name: currentCoach.team?.name || "",
              logo: currentCoach.team?.logo || "",
            },
            leagueId: null,
            cachedAt: now,
            lastUpdated: now,
          },
        ],
      });
    } else {
      coachDoc.name = currentCoach.name;
      coachDoc.firstname = currentCoach.firstname;
      coachDoc.lastname = currentCoach.lastname;
      coachDoc.age = currentCoach.age;
      coachDoc.nationality = currentCoach.nationality;
      coachDoc.photo = currentCoach.photo;

      const historyIndex = coachDoc.history.findIndex(
        (h) => h.team.id === teamId,
      );

      if (historyIndex >= 0) {
        coachDoc.history[historyIndex].team.name =
          currentCoach.team?.name || coachDoc.history[historyIndex].team.name;
        coachDoc.history[historyIndex].team.logo =
          currentCoach.team?.logo || coachDoc.history[historyIndex].team.logo;
        coachDoc.history[historyIndex].cachedAt = now;
        coachDoc.history[historyIndex].lastUpdated = now;
      } else {
        coachDoc.history.push({
          season: new Date().getFullYear(),
          team: {
            id: teamId,
            name: currentCoach.team?.name || "",
            logo: currentCoach.team?.logo || "",
          },
          leagueId: null,
          cachedAt: now,
          lastUpdated: now,
        });
      }

      await coachDoc.save();
    }

    const coachResponse = {
      coachId: coachDoc.coachId,
      name: coachDoc.name,
      firstname: coachDoc.firstname,
      lastname: coachDoc.lastname,
      age: coachDoc.age,
      nationality: coachDoc.nationality,
      photo: coachDoc.photo,
      history: coachDoc.history.filter((h) => h.team.id === teamId),
    };

    return res.json({ status: "success", coach: coachResponse });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to fetch or store coach",
    });
  }
};

const getCoachInfo = async (req, res) => {
  const coachId = parseInt(req.params.coachId, 10);
  let season = parseInt(req.params.season, 10);

  if (isNaN(coachId) || isNaN(season)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid coachId or season" });
  }

  const userId = req.user.id;

  if (season === 0) {
    season = await getCurrentSeason({ leagueId: leagueId, userId });
  }

  try {
    let coachDoc = await Coach.findOne({ coachId });
    const now = new Date();

    const seasonData = coachDoc?.history?.find((h) => h.season === season);
    const needUpdate =
      !seasonData ||
      now - new Date(seasonData.lastUpdated) >= 2 * 60 * 60 * 1000;

    if (seasonData && !needUpdate) {
      return res.json({ status: "success", coach: coachDoc });
    }

    // 🔹 1. Obtener info del coach
    const startCoach = Date.now();
    let coachRes;

    try {
      coachRes = await axios.get(`${API_URL}/coachs`, {
        headers: { "x-apisports-key": API_KEY },
        params: { id: coachId },
      });

      await ApiFootballCall.create({
        endpoint: "/coachs",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: coachRes.status,
        success: true,
        responseTimeMs: Date.now() - startCoach,
        remainingRequests:
          coachRes.headers["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/coachs",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - startCoach,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.status(500).json({
        status: "error",
        message: "Failed to fetch coach from API",
      });
    }

    const apiCoach = coachRes.data?.response?.[0];
    if (!apiCoach) {
      return res
        .status(404)
        .json({ status: "error", message: "Entrenador no encontrado" });
    }

    const teamId = apiCoach.team?.id || null;

    // 🔹 Si no tiene equipo esta temporada
    if (!teamId) {
      const emptySeasonBlock = {
        season,
        team: { id: null, name: null, logo: null },
        leagueId: null,
        stats: {
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          winRate: "0%",
        },
        cachedAt: now,
        lastUpdated: now,
      };

      if (coachDoc) {
        const idx = coachDoc.history.findIndex((h) => h.season === season);
        if (idx >= 0) coachDoc.history[idx] = emptySeasonBlock;
        else coachDoc.history.push(emptySeasonBlock);
      } else {
        coachDoc = await Coach.create({
          coachId: apiCoach.id,
          name: apiCoach.name,
          firstname: apiCoach.firstname,
          lastname: apiCoach.lastname,
          age: apiCoach.age,
          nationality: apiCoach.nationality,
          photo: apiCoach.photo,
          history: [emptySeasonBlock],
        });
      }

      await coachDoc.save();
      return res.json({ status: "success", coach: coachDoc });
    }

    // 🔹 3. Obtener fixtures del equipo en la temporada
    const startFixtures = Date.now();
    let fixturesRes;

    try {
      fixturesRes = await axios.get(`${API_URL}/fixtures`, {
        headers: { "x-apisports-key": API_KEY },
        params: { team: teamId, season },
      });

      await ApiFootballCall.create({
        endpoint: "/fixtures",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: fixturesRes.status,
        success: true,
        responseTimeMs: Date.now() - startFixtures,
        remainingRequests:
          fixturesRes.headers["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/fixtures",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - startFixtures,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.status(500).json({
        status: "error",
        message: "Failed to fetch fixtures from API",
      });
    }

    const allFixtures = fixturesRes.data?.response || [];

    // 🔹 4. Inicializar estadísticas
    const stats = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      winRate: "0%",
    };

    // 🔹 5. Calcular stats CORRECTAMENTE
    for (const fx of allFixtures) {
      // ✅ solo partidos finalizados
      if (fx.fixture.status?.short !== "FT") continue;

      const g = fx.goals;
      if (!g) continue;

      stats.played++;

      const isHome = fx.teams?.home?.id === teamId;
      const gf = isHome ? g.home : g.away;
      const ga = isHome ? g.away : g.home;

      stats.goalsFor += gf ?? 0;
      stats.goalsAgainst += ga ?? 0;

      if (gf > ga) stats.wins++;
      else if (gf < ga) stats.losses++;
      else stats.draws++;
    }

    if (stats.played > 0) {
      stats.winRate = ((stats.wins / stats.played) * 100).toFixed(2) + "%";
    }

    // 🔹 6. Guardar bloque de temporada
    const seasonBlock = {
      season,
      team: {
        id: apiCoach.team?.id || null,
        name: apiCoach.team?.name || null,
        logo: apiCoach.team?.logo || null,
      },
      leagueId: null,
      stats,
      cachedAt: now,
      lastUpdated: now,
    };

    if (coachDoc) {
      const idx = coachDoc.history.findIndex((h) => h.season === season);
      if (idx >= 0) coachDoc.history[idx] = seasonBlock;
      else coachDoc.history.push(seasonBlock);

      coachDoc.set({
        name: apiCoach.name,
        firstname: apiCoach.firstname,
        lastname: apiCoach.lastname,
        age: apiCoach.age,
        nationality: apiCoach.nationality,
        photo: apiCoach.photo,
      });
    } else {
      coachDoc = await Coach.create({
        coachId: apiCoach.id,
        name: apiCoach.name,
        firstname: apiCoach.firstname,
        lastname: apiCoach.lastname,
        age: apiCoach.age,
        nationality: apiCoach.nationality,
        photo: apiCoach.photo,
        history: [seasonBlock],
      });
    }

    await coachDoc.save();

    await registerSearch({
      type: "coach",
      itemId: apiCoach.id,
      name: apiCoach.name,
      photo: apiCoach.photo,
      nationality: apiCoach.nationality,
      teamName: apiCoach.team?.name,
      teamLogo: apiCoach.team?.logo,
    });

    return res.json({ status: "success", coach: coachDoc });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to fetch or store coach",
    });
  }
};

const search = async (req, res) => {
  try {
    const { name } = req.params;
    const userId = req.user?.id || null;
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Nombre requerido",
      });
    }

    const queryName = name.trim().toLowerCase();
    const regex = new RegExp(escapeRegex(queryName), "i");
    const now = new Date();
    const TTL_HOURS = 24;

    // 1️⃣ Buscar entrenadores en BD
    const localCoaches = await Coach.find({
      $or: [{ name: regex }, { firstname: regex }, { lastname: regex }],
    })
      .select(
        "coachId name firstname lastname age nationality photo team updatedAt cachedAt",
      )
      .lean();

    if (localCoaches.length) {
      // 🧠 Calcular relevancia (exacta y parcial)
      const scoredCoaches = localCoaches.map((c) => {
        const nameLower = c.name?.toLowerCase() || "";
        const firstLower = c.firstname?.toLowerCase() || "";
        const lastLower = c.lastname?.toLowerCase() || "";

        let score = 0;
        // Exact match
        if (nameLower === queryName) score += 10;
        if (firstLower === queryName) score += 8;
        if (lastLower === queryName) score += 8;

        // Coincidencias parciales o nombres compuestos
        if (firstLower.split(" ").includes(queryName)) score += 6;
        if (nameLower.split(" ").includes(queryName)) score += 6;
        if (lastLower.split(" ").includes(queryName)) score += 6;
        if (nameLower.includes(queryName)) score += 3;
        if (firstLower.includes(queryName)) score += 3;
        if (lastLower.includes(queryName)) score += 3;

        return { ...c, score };
      });

      // 🔹 Ordenar por relevancia
      scoredCoaches.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      });

      // 🔹 Verificar si los datos son recientes (<24h)
      const lastUpdated = Math.max(
        ...scoredCoaches.map((c) =>
          new Date(c.cachedAt || c.updatedAt || 0).getTime(),
        ),
      );
      const hours = (now.getTime() - lastUpdated) / (1000 * 60 * 60);

      if (hours < TTL_HOURS) {
        return res.json({
          status: "success",
          coaches: scoredCoaches,
        });
      }
    }

    // 2️⃣ Consultar API-Football
    const apiUrl = `${API_URL}/coachs?search=${encodeURIComponent(queryName)}`;
    const startSearch = Date.now();
    let response;

    try {
      response = await axios.get(apiUrl, {
        headers: { "x-apisports-key": API_KEY },
      });

      await ApiFootballCall.create({
        endpoint: "/coachs?search",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: response.status,
        success: true,
        responseTimeMs: Date.now() - startSearch,
        remainingRequests:
          response.headers["x-ratelimit-requests-remaining"] || null,
      });
    } catch (err) {
      await ApiFootballCall.create({
        endpoint: "/coachs?search",
        method: "GET",
        source: "manual",
        user: userId,
        apiProvider: "api-football",
        costUnit: 1,
        statusCode: err.response?.status || 500,
        success: false,
        responseTimeMs: Date.now() - startSearch,
        remainingRequests:
          err.response?.headers?.["x-ratelimit-requests-remaining"] || null,
        errorMessage: err.message,
      });

      return res.status(500).json({
        status: "error",
        message: "Error al consultar API-Football",
      });
    }

    let apiCoaches = Array.isArray(response?.data?.response)
      ? response.data.response
      : [];

    if (!apiCoaches.length) {
      return res.json({
        status: "error",
        message: `No se encontraron entrenadores para "${queryName}"`,
      });
    }

    // 3️⃣ Procesar resultados de la API con el mismo sistema de score
    const cleanCoaches = [];
    const seenIds = new Set();

    for (const c of apiCoaches) {
      if (!c?.id || !c?.name || seenIds.has(c.id)) continue;
      seenIds.add(c.id);

      const nameLower = c.name?.toLowerCase() || "";
      const firstLower = c.firstname?.toLowerCase() || "";
      const lastLower = c.lastname?.toLowerCase() || "";

      let score = 0;
      if (nameLower === queryName) score += 10;
      if (firstLower === queryName) score += 8;
      if (lastLower === queryName) score += 8;
      if (firstLower.split(" ").includes(queryName)) score += 6;
      if (nameLower.split(" ").includes(queryName)) score += 6;
      if (lastLower.split(" ").includes(queryName)) score += 6;
      if (nameLower.includes(queryName)) score += 3;
      if (firstLower.includes(queryName)) score += 3;
      if (lastLower.includes(queryName)) score += 3;

      cleanCoaches.push({
        coachId: c.id,
        name: c.name,
        firstname: c.firstname,
        lastname: c.lastname,
        age: c.age,
        nationality: c.nationality,
        photo: c.photo,
        team: c.team || null,
        cachedAt: now,
        score,
      });
    }

    // 4️⃣ Ordenar por relevancia
    cleanCoaches.sort((a, b) => b.score - a.score);

    // 5️⃣ Guardar / actualizar en BD
    for (const c of cleanCoaches) {
      await Coach.findOneAndUpdate(
        { coachId: c.coachId },
        { $set: c },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    return res.json({
      status: "success",
      coaches: cleanCoaches,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error al buscar entrenadores. Intenta de nuevo.",
    });
  }
};

const escapeRegex = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  getCoachesByLeague,
  getCoachByTeam,
  getCoachInfo,
  search,
};
