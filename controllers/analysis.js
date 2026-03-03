const { analyzeWithGPT } = require("../services/openaiService");
const Analysis = require("../models/analysis");
const { areJSONEqual } = require("../utils/jsonCompare");
const { playerPrompt } = require("../prompts/playerPrompt");
const { fixturePrompt } = require("../prompts/fixturePrompt");
const { seasonPrompt } = require("../prompts/seasonPrompt");
const Player = require("../models/player");
const Team = require("../models/team");

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/* ------------------------------------------------------ */
/* 1. TEMPORADA */
/* ------------------------------------------------------ */
const seasonTeamAnalysis = async (req, res) => {
  try {
    const { season, teamId } = req.params;
    const stats = req.body;
    const referenceId = `${teamId}-${season}`;

    const { start, end } = todayRange();

    // 🔎 Buscar análisis generado hoy
    const today = await Analysis.findOne({
      type: "season",
      referenceId,
      generatedAt: { $gte: start, $lte: end },
    });

    if (today) {
      return res.json({ status: "success", analysis: today.result });
    }

    // 🔎 Buscar último análisis
    const last = await Analysis.findOne({
      type: "season",
      referenceId,
    }).sort({ generatedAt: -1 });

    if (last && areJSONEqual(last.rawStats, stats)) {
      return res.json({ status: "success", analysis: last.result });
    }

    const teamReference = await Team.findOne({ teamId }).lean();

    if (!teamReference) {
      return res.json({
        status: "error",
        message: "Equipo no encontrado",
      });
    }

    const prompt = seasonPrompt(teamReference.name, season);

    const parsed = await analyzeWithGPT(prompt, stats);

    await Analysis.create({
      type: "season",
      referenceId,
      rawStats: stats,
      result: parsed,
      generatedAt: new Date(parsed.generatedAt || Date.now()),
    });

    return res.json({ status: "success", analysis: parsed });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

/* ------------------------------------------------------ */
/* 2. FIXTURE */
/* ------------------------------------------------------ */
const fixtureAnalysis = async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const stats = req.body;
    const referenceId = fixtureId;

    const { start, end } = todayRange();

    const today = await Analysis.findOne({
      type: "fixture",
      referenceId,
      generatedAt: { $gte: start, $lte: end }
    });

    if (today) return res.json({ status: "success", analysis: today.result });

    const last = await Analysis.findOne({
      type: "fixture",
      referenceId,
    }).sort({ generatedAt: -1 });

    if (last && areJSONEqual(last.rawStats, stats))
      return res.json({ status: "success", analysis: last.result });

    const prompt = fixturePrompt(fixtureId);
    const parsed = await analyzeWithGPT(prompt, stats);

    const created = await Analysis.create({
      type: "fixture",
      referenceId,
      rawStats: stats,
      result: parsed,
      generatedAt: parsed.generatedAt ? new Date(parsed.generatedAt) : new Date()
    });

    return res.json({ status: "success", analysis: created.result });

  } catch (error) {
    return res.json({ status: "error", message: 'Internal server error. Please, try again' });
  }
};

/* ------------------------------------------------------ */
/* 3. PLAYER */
/* ------------------------------------------------------ */
const playerAnalysis = async (req, res) => {
  try {
    const { playerId } = req.params;
    const stats = req.body;
    const referenceId = playerId;

    const { start, end } = todayRange();

    const today = await Analysis.findOne({
      type: "player",
      referenceId,
      generatedAt: { $gte: start, $lte: end }
    });

    const player = await Player.findOne({ playerId: parseInt(playerId) });
    const name = player ? player.name : "Desconocido";

    if (today) return res.json({ status: "success", analysis: today.result });

    const last = await Analysis.findOne({
      type: "player",
      referenceId,
    }).sort({ generatedAt: -1 });

    if (last && areJSONEqual(last.rawStats, stats))
      return res.json({ status: "success", analysis: last.result });

    const prompt = playerPrompt(name);
    const parsed = await analyzeWithGPT(prompt, stats);

    await Analysis.create({
      type: "player",
      referenceId,
      rawStats: stats,
      result: parsed,
      generatedAt: parsed.generatedAt ? new Date(parsed.generatedAt) : new Date()
    });

    return res.json({ status: "success", analysis: parsed });

  } catch (error) {
    return res.json({ status: "error", message: 'Internal server error. Please, try again' });
  }
};

module.exports = {
  seasonTeamAnalysis,
  fixtureAnalysis,
  playerAnalysis,
};
