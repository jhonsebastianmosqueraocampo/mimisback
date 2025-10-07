const Country = require("../models/country");

const countries = async (req, res) => {
  try {
    const countries = await Country.find().lean();
    return res.json({
      status: "success",
      countries,
    });
  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

module.exports = {
    countries
}