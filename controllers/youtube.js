const axios = require("axios");
const YoutubeCache = require("../models/youtubeCache");
const Favorite = require("../models/favorite");
const { CHANNELS } = require("../data/youtubeChannels");
require("dotenv").config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// 🔹 Filtra solo videos de canales confiables
const isTrustedChannel = (channelTitle = "") => {
  return CHANNELS.some((name) =>
    channelTitle.toLowerCase().includes(name.toLowerCase())
  );
};

// 🔹 Convierte duración ISO8601 (PT#M#S) a minutos
const parseDurationToMinutes = (duration = "") => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const hours = parseInt(match?.[1] || 0, 10);
  const minutes = parseInt(match?.[2] || 0, 10);
  const seconds = parseInt(match?.[3] || 0, 10);
  return hours * 60 + minutes + seconds / 60;
};

// 🔹 Buscar videos relevantes de YouTube
const fetchYoutubeVideosMatch = async (teamA, teamB, query, season) => {
  const fullQuery = season ? `${query} ${season}` : query;

  // Usa más parámetros para mejorar la relevancia y evitar fake videos
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(
    fullQuery
  )}&order=date&relevanceLanguage=es&regionCode=ES&safeSearch=strict&videoDuration=medium&key=${YOUTUBE_API_KEY}`;

  const { data } = await axios.get(searchUrl);
  const videoIds = data.items.map((item) => item.id.videoId).join(",");

  if (!videoIds) return [];

  // 🔹 Segunda llamada: obtener detalles y duración
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const { data: detailsData } = await axios.get(detailsUrl);

  // 🔹 Filtrar y mapear
  const videos = detailsData.items
    .map((item) => {
      const durationMinutes = parseDurationToMinutes(
        item.contentDetails.duration
      );

      return {
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url,
        duration: durationMinutes,
      };
    })
    .filter(
      (v) =>
        isTrustedChannel(v.channelTitle) &&
        v.duration <= 30 &&
        // Título o descripción contienen ambos equipos
        v.title.toLowerCase().includes(teamA.toLowerCase()) &&
        v.title.toLowerCase().includes(teamB.toLowerCase())
    )
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return videos;
};

const fetchYoutubeVideosTeam = async (team, query, season) => {
  const fullQuery = season ? `${team} ${query} ${season}` : team;

  // Usa más parámetros para mejorar la relevancia y evitar fake videos
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(
    fullQuery
  )}&order=date&relevanceLanguage=es&regionCode=ES&safeSearch=strict&videoDuration=medium&key=${YOUTUBE_API_KEY}`;

  const { data } = await axios.get(searchUrl);
  const videoIds = data.items.map((item) => item.id.videoId).join(",");

  if (!videoIds) return [];

  // 🔹 Segunda llamada: obtener detalles y duración
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const { data: detailsData } = await axios.get(detailsUrl);

  // 🔹 Filtrar y mapear
  const videos = detailsData.items
    .map((item) => {
      const durationMinutes = parseDurationToMinutes(
        item.contentDetails.duration
      );

      return {
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url,
        duration: durationMinutes,
      };
    })
    .filter(
      (v) =>
        isTrustedChannel(v.channelTitle) &&
        v.duration <= 30 &&
        // Título o descripción contienen ambos equipos
        v.title.toLowerCase().includes(team.toLowerCase())
    )
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return videos;
};

const fetchYoutubeVideosPlayer = async (player, query, season) => {
  const fullQuery = season ? `${player} ${query} ${season}` : player;

  // Usa más parámetros para mejorar la relevancia y evitar fake videos
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(
    fullQuery
  )}&order=date&relevanceLanguage=es&regionCode=ES&safeSearch=strict&videoDuration=medium&key=${YOUTUBE_API_KEY}`;

  const { data } = await axios.get(searchUrl);
  const videoIds = data.items.map((item) => item.id.videoId).join(",");

  if (!videoIds) return [];

  // 🔹 Segunda llamada: obtener detalles y duración
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const { data: detailsData } = await axios.get(detailsUrl);

  // 🔹 Filtrar y mapear
  const videos = detailsData.items
    .map((item) => {
      const durationMinutes = parseDurationToMinutes(
        item.contentDetails.duration
      );

      return {
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url,
        duration: durationMinutes,
      };
    })
    .filter(
      (v) =>
        isTrustedChannel(v.channelTitle) &&
        v.duration <= 30 &&
        // Título o descripción contienen ambos equipos
        v.title.toLowerCase().includes(player.toLowerCase())
    )
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return videos;
};

const fetchYoutubeVideos = async (query) => {

  // Usa más parámetros para mejorar la relevancia y evitar fake videos
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=25&q=${encodeURIComponent(
    query
  )}&order=date&relevanceLanguage=es&regionCode=ES&safeSearch=strict&videoDuration=medium&key=${YOUTUBE_API_KEY}`;

  const { data } = await axios.get(searchUrl);
  const videoIds = data.items.map((item) => item.id.videoId).join(",");

  if (!videoIds) return [];

  // 🔹 Segunda llamada: obtener detalles y duración
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
  const { data: detailsData } = await axios.get(detailsUrl);
  // 🔹 Filtrar y mapear
  const videos = detailsData.items
    .map((item) => {
      const durationMinutes = parseDurationToMinutes(
        item.contentDetails.duration
      );

      return {
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.high?.url,
        duration: durationMinutes,
      };
    })
    .filter(
      (v) =>
        isTrustedChannel(v.channelTitle) &&
        v.duration <= 30
    )
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return videos;
};

//Controllers

const getYoutubeVideosMatch = async (req, res) => {
  const { teamA, teamB, query, season } = req.params;

  if (!query || !teamA || !teamB) {
    return res.json({
      status: "error",
      message: "teamA, teamB y query son requeridos",
    });
  }

  try {
    const cacheKey = `${teamA}_${teamB}_${query}_${season || "none"}`;
    let cache = await YoutubeCache.findOne({ query: cacheKey });

    const now = new Date();
    const halfHour = 1000 * 60 * 30;

    if (cache && now - cache.lastFetched < halfHour) {
      return res.json({ status: "success", videos: cache.videos });
    }

    const videos = await fetchYoutubeVideosMatch(teamA, teamB, query, season);

    if (cache) {
      cache.videos = videos;
      cache.lastFetched = now;
      await cache.save();
    } else {
      cache = new YoutubeCache({
        query: cacheKey,
        videos,
        lastFetched: now,
      });
      await cache.save();
    }

    return res.json({ status: "success", videos });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to fetch YouTube videos",
    });
  }
};

const getYoutubeVideosTeam = async (req, res) => {
  const { team, query, season } = req.params;

  if (!team || !query) {
    return res.json({ status: "error", message: "team o query es requerido" });
  }

  try {
    const cacheKey = `${team}_${query}_${season || "none"}`;
    let cache = await YoutubeCache.findOne({ query: cacheKey });

    const now = new Date();
    const halfHour = 1000 * 60 * 30;

    if (cache && now - cache.lastFetched < halfHour) {
      return res.json({ status: "success", videos: cache.videos });
    }

    const videos = await fetchYoutubeVideosTeam(team, query, season);

    if (cache) {
      cache.videos = videos;
      cache.lastFetched = now;
      await cache.save();
    } else {
      cache = new YoutubeCache({
        query: cacheKey,
        videos,
        lastFetched: now,
      });
      await cache.save();
    }

    return res.json({ status: "success", videos });
  } catch (error) {
    return res
      .status(500)
      .json({ status: "error", message: "Failed to fetch YouTube videos" });
  }
};

const getYoutubeVideosPlayer = async (req, res) => {
  const { player, query, season } = req.params;

  if (!player || !query) {
    return res.json({
      status: "error",
      message: "player o query es requerido",
    });
  }

  try {
    const cacheKey = `${player}_${query}_${season || "none"}`;
    let cache = await YoutubeCache.findOne({ query: cacheKey });

    const now = new Date();
    const halfHour = 1000 * 60 * 30;

    if (cache && now - cache.lastFetched < halfHour) {
      return res.json({ status: "success", videos: cache.videos });
    }

    const videos = await fetchYoutubeVideosPlayer(player, query, season);

    if (cache) {
      cache.videos = videos;
      cache.lastFetched = now;
      await cache.save();
    } else {
      cache = new YoutubeCache({
        query: cacheKey,
        videos,
        lastFetched: now,
      });
      await cache.save();
    }

    return res.json({ status: "success", videos });
  } catch (error) {
    return res
      .status(500)
      .json({ status: "error", message: "Failed to fetch YouTube videos" });
  }
};

const getYoutubeVideosFavorites = async (req, res) => {
  const { id } = req.user;
  try {
    const favorites = await Favorite.findOne({ user: id }).lean();
    const now = new Date();
    const halfHour = 1000 * 60 * 30;
    const season =
      now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

    if (!favorites) {
      return res.json({
        status: "error",
        message: "Favorites not found",
      });
    }

    // 🔹 Helper unificado
    const getVideosWithCache = async (name, type) => {
      const cacheKey = `${name}_${type}_${season || "none"}`;
      let cache = await YoutubeCache.findOne({ query: cacheKey });

      if (cache && now - cache.lastFetched < halfHour) {
        return cache.videos;
      }

      const videos = await fetchYoutubeVideosTeam(name, type, season);

      if (cache) {
        cache.videos = videos;
        cache.lastFetched = now;
        await cache.save();
      } else {
        await YoutubeCache.create({
          query: cacheKey,
          videos,
          lastFetched: now,
        });
      }

      return videos;
    };

    // 🔹 Equipos
    const videosTeams = [];
    for (const teamName of favorites.equipos || []) {
      const videos = await getVideosWithCache(teamName, "goals");
      videosTeams.push({
        name: teamName,
        videos,
      });
    }

    // 🔹 Jugadores
    const videosPlayers = [];
    for (const playerName of favorites.jugadores || []) {
      const videos = await getVideosWithCache(playerName, "resume");
      videosPlayers.push({
        name: playerName,
        videos,
      });
    }

    return res.json({
      status: "success",
      videosTeams,
      videosPlayers,
    });

  } catch (error) {
    return res.json({
      status: "error",
      message: "An error was found. Try again",
    });
  }
};

const getYoutubeVideos = async (req, res) => {
  const { query } = req.params;

  if (!query) {
    return res.json({
      status: "error",
      message: "query es requerido",
    });
  }

  try {
    const cacheKey = query;
    let cache = await YoutubeCache.findOne({ query: cacheKey });

    const now = new Date();
    const halfHour = 1000 * 60 * 30;

    if (cache && cache.videos.length > 0 && now - cache.lastFetched < halfHour) {
      return res.json({ status: "success", videos: cache.videos });
    }
    const videos = await fetchYoutubeVideos(query);

    if (cache) {
      cache.videos = videos;
      cache.lastFetched = now;
      await cache.save();
    } else {
      cache = new YoutubeCache({
        query: cacheKey,
        videos,
        lastFetched: now,
      });
      await cache.save();
    }

    return res.json({ status: "success", videos });
  } catch (error) {
    return res.json({
      status: "error",
      message: "Failed to fetch YouTube videos",
    });
  }
};

module.exports = {
  getYoutubeVideosMatch,
  getYoutubeVideosTeam,
  getYoutubeVideosPlayer,
  getYoutubeVideosFavorites,
  getYoutubeVideos
};
