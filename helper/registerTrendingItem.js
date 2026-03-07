const TrendingItem = require("../models/trendingItem");

const registerSearch = async ({ type, itemId, name, photo, nationality, teamName, teamLogo }) => {
  try {
    await TrendingItem.findOneAndUpdate(
      { type, itemId },
      {
        $inc: { searches: 1 },
        $set: {
          name,
          photo,
          nationality,
          teamName,
          teamLogo,
          lastSearchedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.log("Error updating trending:", error.message);
  }
};

module.exports = {
    registerSearch
}