const SyntheticMatch = require("../models/syntheticMatch");

const getSyntheticMatch = async (req, res) => {
  try {
    const matches = await SyntheticMatch.find().sort({ date: -1 }).lean();
    return res.json({
      status: "success",
      syntheticMatch: matches,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

const saveSyntheticMatch = async (req, res) => {
  try {
    const { score } = req.body;

    if (!score) {
      return res.status(400).json({
        status: "error",
        message: "El marcador es obligatorio",
      });
    }

    const lastMatch = await SyntheticMatch.findOne().sort({ matchNumber: -1 });

    const nextMatchNumber = lastMatch ? lastMatch.matchNumber + 1 : 1;

    const match = new SyntheticMatch({
      matchNumber: nextMatchNumber,
      score,
    });

    await match.save();

    return res.json({
      status: "success",
      message: "Match saved successfully"
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "An error was found. Please, try again",
    });
  }
};

module.exports = {
  getSyntheticMatch,
  saveSyntheticMatch,
};
