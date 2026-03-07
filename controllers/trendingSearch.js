const TrendingItem = require("../models/trendingItem");

const getTrending = async (req, res) => {
  const { type } = req.query;

  try {
    const query = type ? { type } : {};

    const items = await TrendingItem.find(query)
      .sort({ searches: -1 })
      .limit(10);

    return res.json({
      status: "success",
      items,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Error getting trending",
    });
  }
};

module.exports = {
    getTrending
}