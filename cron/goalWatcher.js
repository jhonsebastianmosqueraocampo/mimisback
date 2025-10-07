require("dotenv").config();
const cron = require("node-cron");
const axios = require("axios");
const Fixture = require("../models/fixture");
const Favorite = require("../models/favorite");
const { sendPushNotification } = require("./pushService");

const activeWatchers = new Map(); // fixtureId => cronTask
const notifiedGoalsMap = new Map(); // key: userId_fixtureId_player_minute

const startWatchingFixtures = () => {
  cron.schedule("*/5 * * * *", async () => {
    const now = new Date();

    const fixtures = await Fixture.find({
      date: { $lte: now },
      notified: false,
    });

    for (const fixture of fixtures) {
      if (activeWatchers.has(fixture.fixtureId)) continue;

      const hasFavorites = await fixtureHasFavorites(fixture);
      if (hasFavorites) {
        startFixtureWatcher(fixture);
      }
    }
  });
};

// Verifica si algún usuario tiene jugador o equipo favorito en ese partido
const fixtureHasFavorites = async (fixture) => {
  const { home, away } = fixture.teams;

  const favorites = await Favorite.find({
    $or: [
      { jugadores: { $exists: true, $ne: [] } },
      { equipos: { $in: [home.name, away.name] } },
    ],
  });

  return favorites.length > 0;
};

// Inicia el cronjob para un fixture en particular
const startFixtureWatcher = (fixture) => {
  const fixtureId = fixture.fixtureId;

  const task = cron.schedule("*/2 * * * *", async () => {
    try {
      const { data } = await axios.get(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY,
        },
      });

      const fixtureData = data.response[0];
      if (!fixtureData?.events || !fixtureData.fixture?.status?.short) return;

      await processGoals(fixtureData);

      const status = fixtureData.fixture.status.short;
      if (["FT", "AET", "PEN", "CANC"].includes(status)) {
        task.stop();
        task.destroy();
        activeWatchers.delete(fixtureId);
        await Fixture.updateOne({ fixtureId }, { $set: { notified: true } });
      }
    } catch (err) {
      console.error(`❌ Error en watcher del fixture ${fixtureId}:`, err.message);
    }
  });

  task.start();
  activeWatchers.set(fixtureId, task);
};

// Procesa los goles y notifica
const processGoals = async (fixture) => {
  const fixtureId = fixture.fixture.id;
  const events = fixture.events || [];
  const goalEvents = events.filter(e => e.type === "Goal" && e.player?.name && e.time?.elapsed != null);

  if (!goalEvents.length) return;

  const favorites = await Favorite.find().populate("user", "pushToken");

  for (const goal of goalEvents) {
    const playerName = goal.player.name;
    const teamName = goal.team.name;
    const minute = goal.time.elapsed;

    for (const fav of favorites) {
      const user = fav.user;
      if (!user?.pushToken) continue;

      // --- Notificación por jugador favorito ---
      const isFavPlayer = fav.jugadores.includes(playerName);
      const keyPlayer = `${user._id}_${fixtureId}_player_${playerName}_${minute}`;

      if (isFavPlayer && !notifiedGoalsMap.has(keyPlayer)) {
        const msg = `⚽ ${playerName} anotó (${minute}') en ${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
        await sendPushNotification(user.pushToken, msg);
        notifiedGoalsMap.set(keyPlayer, true);
        setTimeout(() => notifiedGoalsMap.delete(keyPlayer), 2 * 60 * 60 * 1000);
        console.log("🔔 Notificación por jugador enviada:", msg);
      }

      // --- Notificación por equipo favorito ---
      const isFavTeam = fav.equipos.includes(teamName);
      const keyTeam = `${user._id}_${fixtureId}_team_${teamName}_${minute}`;

      if (isFavTeam && !notifiedGoalsMap.has(keyTeam)) {
        const msg = `⚽ Gol de ${teamName} (${minute}') en ${fixture.teams.home.name} vs ${fixture.teams.away.name}`;
        await sendPushNotification(user.pushToken, msg);
        notifiedGoalsMap.set(keyTeam, true);
        setTimeout(() => notifiedGoalsMap.delete(keyPlayer), 2 * 60 * 60 * 1000);
        console.log("🔔 Notificación por equipo enviada:", msg);
      }
    }
  }
};

module.exports = {
  startWatchingFixtures,
};