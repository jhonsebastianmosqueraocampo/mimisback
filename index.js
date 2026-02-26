const express = require("express");
const cors = require("cors");
const path = require("path");

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
const teamSummaryRoute = require("./routes/teamSummary.js");
const nationLeagueRoute = require("./routes/nationalLeague.js");
const scorebatRoute = require("./routes/scorebat");
const weeklySyntheticTopRoute = require("./routes/weeklySyntheticTop.js");
const weeklyWorldTopRoute = require("./routes/weeklyWorldTop.js");
const userNewsRoute = require("./routes/userNews.js");
const oneByOneRoute = require("./routes/oneByOne.js");
const shortRoute = require("./routes/short.js");
const analysisRoute = require("./routes/analysis.js");
const storeRoute = require("./routes/store.js");
const updateFixtures = require("./cron/downloadFixtures.js");
const startNewsCleanup = require("./cron/newsCleanup.js");
const startNotificationFixtures = require("./cron/notifyFixtures.js");
const { startWatchingFixtures } = require("./cron/goalWatcher.js");
const { startCron: startLiveMatchesCron } = require("./cron/updateLiveMatch.js");
const closePendingBets  = require("./cron/closePendingBets.js");

const app = express();

app.set("PORT", process.env.PORT || 3001);

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/analysis", analysisRoute);
app.use("/api/bet", betRoute);
app.use("/api/coach", coachRoute);
app.use("/api/country", countryRoute);
app.use("/api/favorites", favoritesRoute);
app.use("/api/fixture", fixtureRoute);
app.use("/api/league", leagueRoute);
app.use("/api/nationLeague", nationLeagueRoute);
app.use("/api/news", newRoute);
app.use("/api/oneByOne", oneByOneRoute);
app.use("/api/player", playerRoute);
app.use("/api/playerSeason", playerSeasonRoute);
app.use("/api/predictions", predictionsRoute);
app.use("/api/predictionOdds", predictionOddsRoute);
app.use("/api/playerCareer", playerCareerRoute);
app.use("/api/scorebat", scorebatRoute);
app.use("/api/shorts", shortRoute);
app.use("/api/store", storeRoute);
app.use("/api/syntheticMatch", syntheticMatchRoute);
app.use("/api/team", teamRoute);
app.use("/api/teamSummary", teamSummaryRoute);
app.use("/api/user", userRoute);
app.use("/api/userNews", userNewsRoute);
app.use("/api/weeklySyntheticTop", weeklySyntheticTopRoute);
app.use("/api/weeklyWorldTop", weeklyWorldTopRoute);
app.use("/api/youtube", youtubeRoute);

const startServer = async () => {
  try {
    await conection();
    await initCountries();
    await updateFixtures();
    await startNewsCleanup();
    // await startLiveMatchesCron();
    // await startNotificationFixtures();
    await closePendingBets()
    
    app.listen(app.get("PORT"), "0.0.0.0", async() => {
      console.log(`🚀 Servidor corriendo en el puerto ${app.get("PORT")}`);
      // startWatchingFixtures()
    });
  } catch (error) {
    process.exit(1);
  }
};

startServer();