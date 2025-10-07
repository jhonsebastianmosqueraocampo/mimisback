const Parser = require("rss-parser");
const News = require("../models/new");
const Team = require("../models/team");
const Player = require("../models/player");
const Coach = require("../models/coach");
const League = require("../models/league");
const { getNews } = require("../helper/getNewsFromApi");
require("dotenv").config();

const parser = new Parser();

const countryLangMap = {
    // América
    AR: "es", // Argentina
    BO: "es", // Bolivia
    BR: "pt", // Brasil
    CL: "es", // Chile
    CO: "es", // Colombia
    CR: "es", // Costa Rica
    EC: "es", // Ecuador
    MX: "es", // México
    PA: "es", // Panamá
    PE: "es", // Perú
    PY: "es", // Paraguay
    UY: "es", // Uruguay
    VE: "es", // Venezuela
    US: "en", // Estados Unidos
    CA: "en", // Canadá (inglés, aunque también se habla francés)

    // Europa
    ES: "es", // España
    GB: "en", // Inglaterra / Reino Unido
    DE: "de", // Alemania
    FR: "fr", // Francia
    IT: "it", // Italia
    PT: "pt", // Portugal
    NL: "nl", // Países Bajos
    BE: "nl", // Bélgica (nl, pero también fr)
    RU: "ru", // Rusia
    TR: "tr", // Turquía
    GR: "el", // Grecia
    PL: "pl", // Polonia
    DK: "da", // Dinamarca
    SE: "sv", // Suecia
    NO: "no", // Noruega
    FI: "fi", // Finlandia
    UA: "uk", // Ucrania
    CZ: "cs", // República Checa
    HR: "hr", // Croacia
    RS: "sr", // Serbia
    CH: "de", // Suiza (de, fr, it → pongo alemán por defecto)

    // África
    MA: "ar", // Marruecos (árabe, también francés)
    DZ: "ar", // Argelia
    TN: "ar", // Túnez
    EG: "ar", // Egipto
    ZA: "en", // Sudáfrica
    NG: "en", // Nigeria
    GH: "en", // Ghana
    CI: "fr", // Costa de Marfil

    // Asia
    JP: "ja", // Japón
    KR: "ko", // Corea del Sur
    CN: "zh", // China
    IN: "hi", // India (aunque también inglés)
    SA: "ar", // Arabia Saudita
    QA: "ar", // Qatar
    AE: "ar", // Emiratos Árabes Unidos
    IR: "fa", // Irán
    TH: "th", // Tailandia
    VN: "vi", // Vietnam

    // Oceanía
    AU: "en", // Australia
    NZ: "en", // Nueva Zelanda
  };

const getNewsForTeam = async (req, res) => {
  const team = req.params.team?.toLowerCase();
  if (!team) return res.json({ status: "error", message: "No team provided" });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const cachedNews = await News.find({
      theme: team,
      publishedAt: { $gte: todayStart },
    });

    if (cachedNews.length > 0) {
      return res.json({
        status: "success",
        news: cachedNews,
      });
    }

    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      team
    )}&hl=es-419&gl=CO&ceid=CO:es-419`;

    const feed = await parser.parseURL(feedUrl);

    const articles = feed.items.map((item) => ({
      title: item.title,
      url: item.link,
      publishedAt: item.pubDate,
      source: item.creator || item.source || "Google News",
      theme: team,
    }));

    const existingUrls = await News.find({
      url: { $in: articles.map((a) => a.url) },
    }).distinct("url");

    const newArticles = articles.filter((a) => !existingUrls.includes(a.url));

    const savedArticles = await News.insertMany(newArticles, {
      ordered: false,
    }).catch(() => []);

    return res.json({
      status: "success",
      news: savedArticles.length > 0 ? savedArticles : articles,
    });
  } catch (err) {
    console.error(err);
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getRumorNewsForTeam = async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);

  if (isNaN(teamId) || !teamId) {
    return res.status(400).json({ status: "error", message: "Invalid teamId" });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const team = await Team.findOne({ teamId }).lean();
    if (!team) {
      return res
        .status(404)
        .json({ status: "error", message: "Team not found" });
    }

    const cachedNews = await News.find({
      theme: team.name,
      publishedAt: { $gte: todayStart },
    });

    if (cachedNews.length > 0) {
      return res.json({
        status: "success",
        news: cachedNews,
      });
    }

    const newSigns = await getNews(
      `"fichaje confirmado" OR "nuevo jugador" OR "transferencia oficial" OR "presentado como" OR "firma oficial"`,
      team.name
    );

    const newRumors = await getNews(
      `"rumor de fichaje" OR "posible fichaje" OR "pretende fichar" OR "interesado en" OR "en negociaciones" OR "cerca de fichar" OR "podría fichar" OR "acercamiento"`,
      team.name
    );

    const existingUrls = await News.find({
      url: { $in: [...newSigns, ...newRumors].map((a) => a.url) },
    }).distinct("url");

    const newArticlesSign = newSigns.filter(
      (a) => !existingUrls.includes(a.url)
    );
    const newArticlesRumor = newRumors.filter(
      (a) => !existingUrls.includes(a.url)
    );

    const savedSigns = await News.insertMany(newArticlesSign, {
      ordered: false,
    }).catch(() => []);

    const savedRumors = await News.insertMany(newArticlesRumor, {
      ordered: false,
    }).catch(() => []);

    return res.json({
      status: "success",
      newsSign: savedSigns.length > 0 ? savedSigns : newSigns,
      newsRumor: savedRumors.length > 0 ? savedRumors : newRumors,
    });
  } catch (err) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getPlayerNews = async (req, res) => {
  const playerId = parseInt(req.params.playerId, 10);

  if (isNaN(playerId) || !playerId) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid playerId" });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const player = await Player.findOne({ playerId }).lean();
    if (!player) {
      return res
        .status(404)
        .json({ status: "error", message: "Player not found" });
    }

    // Buscar noticias en caché ordenadas por fecha (más recientes primero)
    const cachedNews = await News.find({
      theme: player.name,
      publishedAt: { $gte: todayStart },
    }).sort({ publishedAt: -1 });

    if (cachedNews.length > 0) {
      return res.json({
        status: "success",
        news: cachedNews,
      });
    }

    const query = `"${player.name}" OR ${player.firstname} ${player.lastname}`;
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=es-419&gl=CO&ceid=CO:es-419`;

    const feed = await parser.parseURL(feedUrl);

    const articles = feed.items.map((item) => ({
      title: item.title,
      url: item.link,
      publishedAt: item.pubDate,
      source: item.creator || item.source || "Google News",
      theme: player.name,
    }));

    // Verificar URLs ya guardadas
    const existingUrls = await News.find({
      url: { $in: articles.map((a) => a.url) },
    }).distinct("url");

    const newArticles = articles.filter((a) => !existingUrls.includes(a.url));

    const savedArticles = await News.insertMany(newArticles, {
      ordered: false,
    }).catch(() => []);

    // Devolver todo ordenado
    const allNews =
      savedArticles.length > 0 ? [...savedArticles, ...cachedNews] : articles;

    return res.json({
      status: "success",
      news: allNews.sort(
        (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
      ),
    });
  } catch (err) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getLeagueNews = async (req, res) => {
  const leagueId = parseInt(req.params.leagueId, 10);

  if (isNaN(leagueId) || !leagueId) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid leagueId" });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const league = await League.findOne({
      "league.id": leagueId,
    });

    const cachedNews = await News.find({
      theme: league.league.name,
      publishedAt: { $gte: todayStart },
    }).sort({ publishedAt: -1 });

    if (cachedNews.length > 0) {
      return res.json({
        status: "success",
        news: cachedNews,
      });
    }

    const lang = countryLangMap[league.country.code] || "en";
    const query = `"${league.league.name}" AND (${league.country.name})`;
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=es-419&gl=CO&ceid=${league.country.code}:${lang}`;

    const feed = await parser.parseURL(feedUrl);

    const articles = feed.items.map((item) => ({
      title: item.title,
      url: item.link,
      publishedAt: item.pubDate,
      source: item.creator || item.source || "Google News",
      theme: league.league.name,
    }));

    const existingUrls = await News.find({
      url: { $in: articles.map((a) => a.url) },
    }).distinct("url");

    const newArticles = articles.filter((a) => !existingUrls.includes(a.url));

    const savedArticles = await News.insertMany(newArticles, {
      ordered: false,
    }).catch(() => []);

    const allNews =
      savedArticles.length > 0 ? [...savedArticles, ...cachedNews] : articles;

    return res.json({
      status: "success",
      news: allNews.sort(
        (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
      ),
    });
  } catch (err) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getCoachNews = async (req, res) => {
  const coachId = parseInt(req.params.coachId, 10);

  if (isNaN(coachId) || !coachId) {
    return res
      .status(400)
      .json({ status: "error", message: "Invalid coachId" });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  try {
    const coach = await Coach.findOne({ coachId }).lean();
    if (!coach) {
      return res
        .status(404)
        .json({ status: "error", message: "coach not found" });
    }

    const cachedNews = await News.find({
      theme: coach.name,
      publishedAt: { $gte: todayStart },
    }).sort({ publishedAt: -1 });

    if (cachedNews.length > 0) {
      return res.json({
        status: "success",
        news: cachedNews,
      });
    }

    const query = `"${coach.name}" OR ${coach.firstname} ${coach.lastname}`;
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=es-419&gl=CO&ceid=CO:es-419`;

    const feed = await parser.parseURL(feedUrl);

    const articles = feed.items.map((item) => ({
      title: item.title,
      url: item.link,
      publishedAt: item.pubDate,
      source: item.creator || item.source || "Google News",
      theme: coach.name,
    }));

    // Verificar URLs ya guardadas
    const existingUrls = await News.find({
      url: { $in: articles.map((a) => a.url) },
    }).distinct("url");

    const newArticles = articles.filter((a) => !existingUrls.includes(a.url));

    const savedArticles = await News.insertMany(newArticles, {
      ordered: false,
    }).catch(() => []);

    // Devolver todo ordenado
    const allNews =
      savedArticles.length > 0 ? [...savedArticles, ...cachedNews] : articles;

    return res.json({
      status: "success",
      news: allNews.sort(
        (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
      ),
    });
  } catch (err) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

module.exports = {
  getNewsForTeam,
  getRumorNewsForTeam,
  getPlayerNews,
  getLeagueNews,
  getCoachNews
};
