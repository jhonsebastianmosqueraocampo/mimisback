const axios = require("axios");
const GroupStanding = require("../models/groupStanding");
const CupStanding = require("../models/cupStanding");
require("dotenv").config();

const API_URL = process.env.API_URL;
const API_KEY = process.env.API_FOOTBALL_KEY;

const getCupStandings = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  const season = parseInt(req.params.season, 10);

  if (isNaN(leagueId) || !leagueId || isNaN(season) || !season) {
    return res.status(400).json({ status: "error", message: "Invalid leagueId or season" });
  }

  try {
    const now = new Date();

    const latestGroup = await GroupStanding.findOne({ leagueId, season }).sort({ lastUpdate: -1 });
    const latestFixture = await CupStanding.findOne({ leagueId, season }).sort({ lastUpdate: -1 });

    const groupRecent = latestGroup && now - latestGroup.lastUpdate < 1000 * 60 * 60;
    const fixtureRecent = latestFixture && now - latestFixture.lastUpdate < 1000 * 60 * 60;
    if (groupRecent && fixtureRecent) {
      const groupPhase = await GroupStanding.find({ leagueId, season });
      const knockoutPhase = await CupStanding.find({ leagueId, season });
      return res.json({
        status: "success",
        hasGroupPhase: groupPhase.length > 0,
        groupPhase,
        knockoutPhase,
      });
    }

    const standingsRes = await axios.get(`${API_URL}/standings`, {
      headers: { "x-apisports-key": API_KEY },
      params: { league: leagueId, season },
    });

    const standingsData = standingsRes.data.response;
    let groupPhase = [];

    if (
      standingsData.length > 0 &&
      Array.isArray(standingsData[0].league.standings)
    ) {
      const allGroups = standingsData[0].league.standings.flat();
      if (allGroups.length > 0) {
        groupPhase = allGroups;

        for (const team of allGroups) {
          await GroupStanding.updateOne(
            {
              leagueId,
              season,
              group: team.group,
              "team.id": team.team.id,
            },
            {
              leagueId,
              season,
              group: team.group,
              team: {
                id: team.team.id,
                name: team.team.name,
                logo: team.team.logo,
              },
              rank: team.rank,
              points: team.points,
              all: team.all,
              lastUpdate: now,
            },
            { upsert: true }
          );
        }
      }
    }

    const fixturesRes = await axios.get(`${API_URL}/fixtures`, {
      headers: { "x-apisports-key": API_KEY },
      params: { league: leagueId, season },
    });

    const fixtures = fixturesRes.data.response;

    for (const fixture of fixtures) {
      const matchData = {
        leagueId: fixture.league.id,
        season: fixture.league.season,
        round: fixture.league.round,
        date: fixture.fixture.date,
        homeTeam: {
          id: fixture.teams.home.id,
          name: fixture.teams.home.name,
          logo: fixture.teams.home.logo,
        },
        awayTeam: {
          id: fixture.teams.away.id,
          name: fixture.teams.away.name,
          logo: fixture.teams.away.logo,
        },
        goals: fixture.goals,
        score: fixture.score,
        status: fixture.fixture.status.short,
        lastUpdate: now,
      };

      await CupStanding.updateOne(
        {
          leagueId,
          season,
          round: fixture.league.round,
          "homeTeam.id": fixture.teams.home.id,
          "awayTeam.id": fixture.teams.away.id,
        },
        matchData,
        { upsert: true }
      );
    }

    const knockoutPhase = await CupStanding.find({ leagueId, season });
    const groupPhaseFinal = groupPhase.length ? await GroupStanding.find({ leagueId, season }) : null;

    return res.json({
      status: "success",
      hasGroupPhase: groupPhaseFinal !== null,
      groupPhase: groupPhaseFinal,
      knockoutPhase,
    });

  } catch (error) {
    return res.json({ status: "error", message: "An error was found. Please, try again!" });
  }
};

module.exports = { getCupStandings };