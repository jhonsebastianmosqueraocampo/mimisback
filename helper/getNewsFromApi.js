const Parser = require("rss-parser");

const parser = new Parser();

const getNews = async(query, teamName) => {
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${teamName} ${query}`
  )}&hl=es-419&gl=CO&ceid=CO:es-419`;

  const feed = await parser.parseURL(feedUrl);

  return feed.items.map((item) => ({
    title: item.title,
    url: item.link,
    publishedAt: item.pubDate,
    source: item.creator || item.source || "Google News",
    theme: teamName,
  }));
};

module.exports = {
  getNews,
};
