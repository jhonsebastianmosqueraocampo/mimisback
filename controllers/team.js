const Team = require("../models/team");
const TeamPlayerStatByLeague = require("../models/TeamPlayerStatByLeague");
const Squad = require("../models/squad");
const axios = require("axios");
require("dotenv").config();

const { getLeaguesByTeam } = require("../helper/getLeaguesByTeam");

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_URL = process.env.API_URL;

const teams = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);
  if (isNaN(leagueId) || !leagueId) {
    return res.json({ status: "error", message: "Invalid leagueId" });
  }
  const season = parseInt(req.params.season, 10);
  if (isNaN(season) || !season) {
    return res.json({ status: "error", message: "Invalid season" });
  }

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
  const teamId = parseInt(req.params.teamId, 10);

  if (isNaN(teamId) || !teamId) {
    return res.json({ status: "error", message: "Invalid teamId" });
  }

  try {
    let team = await Team.findOne({ teamId }).lean();

    if (team) {
      return res.json({ status: "success", team });
    }

    const { data } = await axios.get(
      `https://v3.football.api-sports.io/teams`,
      {
        headers: {
          "x-apisports-key": API_FOOTBALL_KEY,
        },
        params: {
          id: teamId,
        },
      }
    );

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

    return res.json({ status: "success", team: newTeam });
  } catch (error) {
    console.error("Error getting team:", error.message);
    return res.status(500).json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getTeamPlayerStats = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  const season = parseInt(req.params.season, 10);

  if (!teamId || isNaN(teamId) || !season || isNaN(season)) {
    return res.json({ status: "error", message: "Invalid parameters" });
  }

  try {
    const leagues = await getLeaguesByTeam(teamId, season);

    if (!leagues || leagues.length === 0) {
      return res.json({ status: "success", stats: [] });
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const allStats = []

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
  const season = parseInt(req.params.season, 10);

  if (!teamId || !leagueId || !season) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid parameters" });
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
    return res.status(500).json({
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
      const daysSinceUpdate = (Date.now() - existingSquad.lastUpdated) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate < 10) {
        return res.json({
          status: "success",
          squad: existingSquad
        });
      }
    }

    const { data } = await axios.get(`${API_URL}/players/squads?team=${teamId}`, {
      headers: { "x-apisports-key": API_KEY }
    });

    if (!data.response || data.response.length === 0) {
      return res.json({
        status: "error",
        message: "No squad found for this team."
      });
    }

    const squadData = data.response[0];
    const newSquad = {
      teamId: squadData.team.id,
      teamName: squadData.team.name,
      teamLogo: squadData.team.logo,
      players: squadData.players.map(p => ({
        id: p.id,
        name: p.name,
        age: p.age,
        number: p.number,
        position: p.position,
        photo: p.photo
      })),
      lastUpdated: Date.now()
    };

    const updatedSquad = await Squad.findOneAndUpdate(
      { teamId },
      newSquad,
      { upsert: true, new: true }
    );

    return res.json({
      status: "success",
      squad: updatedSquad
    });

  } catch (error) {
    return res.json({
      status: "error",
      message: "An error occurred. Please try again."
    });
  }
};

module.exports = {
  teams,
  getTeam,
  getTeamPlayerStats,
  getTeamPlayerStatsByLeague,
  getSquad
};
