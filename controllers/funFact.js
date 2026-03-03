const FunFact = require("../models/FunFact");

// ADMIN - Crear dato curioso
const createFunFact = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length < 5) {
      return res.status(400).json({
        status: "error",
        message: "Texto demasiado corto",
      });
    }

    const fact = await FunFact.create({
      text,
    });

    return res.json({
      status: "success"
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

// USER - Scroll infinito
const getFunFacts = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = 15;
    const skip = (page - 1) * limit;

    const facts = await FunFact.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return res.json({
      status: "success",
      facts,
      hasMore: facts.length === limit,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

module.exports = {
  createFunFact,
  getFunFacts,
};
