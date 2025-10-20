const axios = require("axios");
const Coach = require("../models/coach");
const Team = require("../models/team");
const { getCurrentSeason } = require("../helper/getCurrentSeason");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const getCoachesByLeague = async (req, res) => {
  const { leagueId, season } = req.params;
  if (!leagueId || !season) {
    return res.json({ status: "error", message: "Missing leagueId or season" });
  }

  try {
    const parsedLeagueId = parseInt(leagueId, 10);
    let parsedSeason = parseInt(season, 10);

    if (parsedSeason === 0) {
      parsedSeason = await getCurrentSeason({ leagueId: parsedLeagueId });
    }

    const existingCoaches = await Coach.aggregate([
      {
        $match: {
          history: {
            $elemMatch: { leagueId: parsedLeagueId, season: parsedSeason },
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
                  { $eq: ["$$h.leagueId", parsedLeagueId] },
                  { $eq: ["$$h.season", parsedSeason] },
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

    let teams = await Team.find({ leagueId: parsedLeagueId });
    if (teams.length === 0) {
      const teamsRes = await axios.get(`${API_URL}/teams`, {
        headers: { "x-apisports-key": API_KEY },
        params: { league: parsedLeagueId, season: parsedSeason },
      });

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
        leagueId: parsedLeagueId,
      }));

      await Team.insertMany(teamDocs);
      teams = teamDocs;
    }

    for (const team of teams) {
      const teamId = team.teamId;

      try {
        const coachRes = await axios.get(`${API_URL}/coachs`, {
          headers: { "x-apisports-key": API_KEY },
          params: { team: teamId },
        });

        const coachList = coachRes.data.response || [];

        const currentCoach = coachList.find((coach) =>
          coach.career?.some(
            (c) =>
              c.team?.id === teamId && (c.end === null || c.end === undefined)
          )
        );

        if (!currentCoach) continue;

        const now = new Date();

        let coachDoc = await Coach.findOne({ coachId: currentCoach.id });

        const entryIndex =
          coachDoc?.history.findIndex(
            (h) => h.season === parsedSeason && h.team?.id === teamId
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
                season: parsedSeason,
                team: { id: teamId, name: team.name, logo: team.logo },
                leagueId: parsedLeagueId,
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
            coachDoc.history[entryIndex].leagueId = parsedLeagueId;
            coachDoc.history[entryIndex].cachedAt = now;
            coachDoc.history[entryIndex].lastUpdated = now;
          } else {
            coachDoc.history.push({
              season: parsedSeason,
              team: { id: teamId, name: team.name, logo: team.logo },
              leagueId: parsedLeagueId,
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
          err?.response?.data || err.message
        );
      }
    }

    const coaches = await Coach.aggregate([
      {
        $match: {
          history: {
            $elemMatch: { leagueId: parsedLeagueId, season: parsedSeason },
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
                  { $eq: ["$$h.leagueId", parsedLeagueId] },
                  { $eq: ["$$h.season", parsedSeason] },
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
    console.error(error);
    return res.json({
      status: "error",
      message: "Failed to fetch or store coaches",
    });
  }
};

const getCoachByTeam = async (req, res) => {
  const CACHE_DAYS_LIMIT = 1;
  const teamId = parseInt(req.params.teamId, 10);

  if (isNaN(teamId) || !teamId) {
    return res.status(400).json({ status: "error", message: "Invalid teamId" });
  }

  try {
    const existingCoach = await Coach.findOne({
      "history.team.id": teamId,
    });

    if (existingCoach) {
      const historyEntry = existingCoach.history.find(
        (h) => h.team.id === teamId
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

    const coachRes = await axios.get(`${API_URL}/coachs`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamId },
    });

    const coachList = coachRes.data.response || [];

    const currentCoach = coachList.find((coach) =>
      coach.career?.some(
        (c) => c.team?.id === teamId && (c.end === null || c.end === undefined)
      )
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
        (h) => h.team.id === teamId
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
    console.error(
      "getCoachByTeam error:",
      error?.response?.data || error.message
    );
    return res.json({
      status: "error",
      message: "Failed to fetch or store coach",
    });
  }
};

const getCoachInfo = async (req, res) => {
  const coachId = parseInt(req.params.coachId, 10);
  const season = parseInt(req.params.season, 10);

  if (!Number.isFinite(coachId)) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid coachId" });
  }
  if (!Number.isFinite(season)) {
    return res.status(400).json({ status: "error", message: "Invalid season" });
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

    const coachRes = await axios.get(`${API_URL}/coachs`, {
      headers: { "x-apisports-key": API_KEY },
      params: { id: coachId },
    });

    const apiCoach = coachRes.data?.response?.[0];
    if (!apiCoach) {
      return res
        .status(404)
        .json({ status: "error", message: "Entrenador no encontrado" });
    }

    const teamId = apiCoach.team?.id;
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

        coachDoc.set({
          name: apiCoach.name,
          firstname: apiCoach.firstname,
          lastname: apiCoach.lastname,
          age: apiCoach.age,
          nationality: apiCoach.nationality,
          photo: apiCoach.photo,
        });
        await coachDoc.save();
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

      return res.json({ status: "success", coach: coachDoc });
    }

    const tenure = (apiCoach.career || []).find(
      (c) => c.team?.id === teamId && (c.end === null || c.end === undefined)
    );
    const tenureStart = tenure?.start ? new Date(tenure.start) : null;

    const fixturesRes = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { team: teamId, season },
    });

    const allFixtures = fixturesRes.data?.response || [];

    const stats = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      winRate: "0%",
    };

    for (const fx of allFixtures) {
      const fixtureId = fx.fixture?.id;
      if (!fixtureId) continue;

      if (tenureStart) {
        const matchDate = new Date(fx.fixture?.date);
        if (matchDate < tenureStart) continue;
      }

      let coachedThisMatch = false;
      try {
        const lineupsRes = await axios.get(`${API_URL}/fixtures/lineups`, {
          headers: { "x-apisports-key": API_KEY },
          params: { fixture: fixtureId, team: teamId },
        });

        const lineup = lineupsRes.data?.response?.[0];
        if (lineup?.coach?.id === coachId) {
          coachedThisMatch = true;
        }
      } catch (e) {
        continue;
      }

      if (!coachedThisMatch) continue;

      const g = fx.goals;
      if (g == null) continue;
      stats.played++;

      const isHome = fx.teams?.home?.id === teamId;
      const gf = isHome ? g.home : g.away;
      const ga = isHome ? g.away : g.home;

      stats.goalsFor += gf ?? 0;
      stats.goalsAgainst += ga ?? 0;

      if ((gf ?? 0) > (ga ?? 0)) stats.wins++;
      else if ((gf ?? 0) < (ga ?? 0)) stats.losses++;
      else stats.draws++;
    }

    if (stats.played > 0) {
      stats.winRate = ((stats.wins / stats.played) * 100).toFixed(2) + "%";
    }

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

      await coachDoc.save();
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

    return res.json({ status: "success", coach: coachDoc });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to fetch or store coach",
    });
  }
};

module.exports = {
  getCoachesByLeague,
  getCoachByTeam,
  getCoachInfo,
};
