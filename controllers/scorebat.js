const axios = require("axios");
const ScorebatVideo = require("../models/ScorebatVideo");
require("dotenv").config();

const SCOREBAT_API_KEY = process.env.SCOREBAT_API_KEY;

const API_URL = process.env.SCOREBAT_API_URL;
const UPDATE_INTERVAL_HOURS = 1;

// =========================
// ✅ Buscar por equipo
// =========================
const getVideosByTeam = async (req, res) => {
  try {
    const { teamName } = req.params;
    let record = await ScorebatVideo.findOne({ queryType: "team", queryValue: teamName.toLowerCase() });

    const expired = !record || (Date.now() - new Date(record.lastUpdated).getTime()) / (1000 * 60 * 60) >= UPDATE_INTERVAL_HOURS;

    if (expired) {
      const { data } = await axios.get(`${API_URL}/team/${teamName}/?token=${SCOREBAT_API_KEY}`);
      const raw = data.response || [];
      console.log(data)
      console.log(row)

      const filtered = raw.filter(
        (v) =>
          v.s1?.toLowerCase().includes(teamName.toLowerCase()) ||
          v.s2?.toLowerCase().includes(teamName.toLowerCase())
      );

      const videos = filtered.map((item) => ({
        id: item.id,
        title: `${item.s1} ${item.sc1 ?? ""} - ${item.sc2 ?? ""} ${item.s2}`,
        side1: item.s1,
        side2: item.s2,
        score: `${item.sc1 ?? ""}-${item.sc2 ?? ""}`,
        status: item.s,
        competition: item.fl,
        country: item.cn,
        date: item.dt ? new Date(item.dt * 1000) : null,
        videos: (item.v || []).map((v) => ({
          title: v.title || "Highlights",
          embed: v.embed,
        })),
      }));

      if (!record) {
        record = new ScorebatVideo({
          queryType: "team",
          queryValue: teamName.toLowerCase(),
          videos,
          lastUpdated: new Date(),
        });
      } else {
        record.videos = videos;
        record.lastUpdated = new Date();
      }

      await record.save();
    }

    return res.json({ status: 'success', videos: record.videos });
  } catch (error) {
    return res.json({ status: 'error', message: "Error interno del servidor" });
  }
};

// =========================
// ✅ Buscar por fixture (dos equipos)
// =========================
const getVideosByFixture = async (req, res) => {
  try {
    const { homeTeam, awayTeam } = req.params;
    const query = `${homeTeam} vs ${awayTeam}`.toLowerCase();

    let record = await ScorebatVideo.findOne({ queryType: "fixture", queryValue: query });
    const expired =
      !record ||
      (Date.now() - new Date(record.lastUpdated).getTime()) / (1000 * 60 * 60) >= UPDATE_INTERVAL_HOURS;

    if (expired) {
      console.log("⏳ Consultando ScoreBat API (fixture):", query);
      const { data } = await axios.get(API_URL);
      const raw = data?.response?.v || [];

      const filtered = raw.filter(
        (v) =>
          v.s1?.toLowerCase().includes(homeTeam.toLowerCase()) &&
          v.s2?.toLowerCase().includes(awayTeam.toLowerCase())
      );

      const videos = filtered.map((item) => ({
        id: item.id,
        title: `${item.s1} ${item.sc1 ?? ""} - ${item.sc2 ?? ""} ${item.s2}`,
        side1: item.s1,
        side2: item.s2,
        score: `${item.sc1 ?? ""}-${item.sc2 ?? ""}`,
        status: item.s,
        competition: item.fl,
        country: item.cn,
        date: item.dt ? new Date(item.dt * 1000) : null,
        videos: (item.v || []).map((v) => ({
          title: v.title || "Highlights",
          embed: v.embed,
        })),
      }));

      if (!record) {
        record = new ScorebatVideo({
          queryType: "fixture",
          queryValue: query,
          videos,
          lastUpdated: new Date(),
        });
      } else {
        record.videos = videos;
        record.lastUpdated = new Date();
      }

      await record.save();
    }

    res.json({ success: true, videos: record.videos });
  } catch (error) {
    console.error("❌ Error getVideosByFixture:", error.message);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

// =========================
// ✅ Buscar por torneo
// =========================
const getVideosByTournament = async (req, res) => {
  try {
    const { tournamentName } = req.params;

    let record = await ScorebatVideo.findOne({ queryType: "tournament", queryValue: tournamentName.toLowerCase() });
    const expired =
      !record ||
      (Date.now() - new Date(record.lastUpdated).getTime()) / (1000 * 60 * 60) >= UPDATE_INTERVAL_HOURS;

    if (expired) {
      console.log("⏳ Consultando ScoreBat API (tournament):", tournamentName);
      const { data } = await axios.get(API_URL);
      const raw = data?.response?.v || [];

      const filtered = raw.filter((v) =>
        v.fl?.toLowerCase().includes(tournamentName.toLowerCase())
      );

      const videos = filtered.map((item) => ({
        id: item.id,
        title: `${item.s1} ${item.sc1 ?? ""} - ${item.sc2 ?? ""} ${item.s2}`,
        side1: item.s1,
        side2: item.s2,
        score: `${item.sc1 ?? ""}-${item.sc2 ?? ""}`,
        status: item.s,
        competition: item.fl,
        country: item.cn,
        date: item.dt ? new Date(item.dt * 1000) : null,
        videos: (item.v || []).map((v) => ({
          title: v.title || "Highlights",
          embed: v.embed,
        })),
      }));

      if (!record) {
        record = new ScorebatVideo({
          queryType: "tournament",
          queryValue: tournamentName.toLowerCase(),
          videos,
          lastUpdated: new Date(),
        });
      } else {
        record.videos = videos;
        record.lastUpdated = new Date();
      }

      await record.save();
    }

    res.json({ success: true, videos: record.videos });
  } catch (error) {
    console.error("❌ Error getVideosByTournament:", error.message);
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
};

module.exports = {
  getVideosByTeam,
  getVideosByFixture,
  getVideosByTournament,
};