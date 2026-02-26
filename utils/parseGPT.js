function parseGPT(textOutput) {
  try {
    return JSON.parse(textOutput);
  } catch (err) {
    // fallback por si GPT responde texto no estructurado
    return {
      text: textOutput,
      summary: {},
      charts: {},
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { parseGPT };