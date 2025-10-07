const axios = require("axios");
const YoutubeCache = require("../models/youtubeCache");
require("dotenv").config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const fetchYoutubeVideos = async (query, season) => {
  const fullQuery = season ? `${query} ${season}` : query;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(
    fullQuery
  )}&order=date&key=${YOUTUBE_API_KEY}`;

  const { data } = await axios.get(url);

  const items = data.items.sort(
    (a, b) =>
      new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt)
  );

  return items.map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.high?.url,
  }));
};

const getYoutubeVideos = async (req, res) => {
  const { query } = req.params;

  const season = parseInt(req.params.season, 10);

  if (isNaN(season) || !season) {
    return res.json({ status: "error", message: "Invalid season" });
  }

  if (!query) {
    return res
      .status(400)
      .json({ status: "error", message: "Query is required" });
  }

  try {
    const cacheKey = season ? `${query}-${season}` : query;
    let cache = await YoutubeCache.findOne({ query: cacheKey });

    const now = new Date();
    const fiveHours = 1000 * 60 * 60 * 5;

    if (cache && now - cache.lastFetched < fiveHours) {
      return res.json({ status: "success", videos: cache.videos });
    }

    const videos = await fetchYoutubeVideos(query, season);

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

module.exports = {
    getYoutubeVideos
}