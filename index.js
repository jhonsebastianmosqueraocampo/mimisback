const express = require("express");
const cors = require("cors");

const { conection } = require("./database/conection.js");
const initCountries = require("./helper/initCountries.js");
const userRoute = require("./routes/user.js");
const teamRoute = require("./routes/team.js");
const countryRoute = require("./routes/country.js");
const leagueRoute = require("./routes/league.js");
const playerRoute = require("./routes/player.js");
const coachRoute = require("./routes/coach.js");
const favoritesRoute = require("./routes/favorites.js");
const newRoute = require("./routes/new.js");
const fixtureRoute = require("./routes/fixture.js");
const playerSeasonRoute = require("./routes/playerSeason.js");
const playerCareerRoute = require("./routes/playerCareer.js");
const youtubeRoute = require("./routes/youtube.js");
const predictionsRoute = require("./routes/predictions.js");
const predictionOddsRoute = require("./routes/predictionOdds.js");
const betRoute = require("./routes/bet.js");
const syntheticMatchRoute = require("./routes/syntheticMatch.js");
const updateFixtures = require("./cron/downloadFixtures.js");
const startNewsCleanup = require("./cron/newsCleanup.js");
const startNotificationFixtures = require("./cron/notifyFixtures.js");
const { startWatchingFixtures } = require("./cron/goalWatcher.js");
const { startCron: startLiveMatchesCron } = require("./cron/updateLiveMatch.js");

const app = express();

app.set("PORT", process.env.PORT || 3001);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/user", userRoute);
app.use("/api/team", teamRoute);
app.use("/api/country", countryRoute);
app.use("/api/league", leagueRoute);
app.use("/api/player", playerRoute);
app.use("/api/coach", coachRoute);
app.use("/api/favorites", favoritesRoute);
app.use("/api/news", newRoute);
app.use("/api/fixture", fixtureRoute);
app.use("/api/playerSeason", playerSeasonRoute);
app.use("/api/youtube", youtubeRoute);
app.use("/api/predictions", predictionsRoute);
app.use("/api/predictionOdds", predictionOddsRoute);
app.use("/api/bet", betRoute);
app.use("/api/syntheticMatch", syntheticMatchRoute);

const startServer = async () => {
  try {
    await conection();
    await initCountries();
    await updateFixtures();
    await startNewsCleanup();
    // await startLiveMatchesCron();
    
    app.listen(app.get("PORT"), "0.0.0.0", async() => {
      console.log(`🚀 Servidor corriendo en el puerto ${app.get("PORT")}`);
      // await startNotificationFixtures();
      // startWatchingFixtures()
    });
  } catch (error) {
    process.exit(1);
  }
};

startServer();