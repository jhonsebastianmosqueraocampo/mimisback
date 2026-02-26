const OpenAI = require("openai");
require("dotenv").config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Llama al modelo gpt-4o-mini para análisis de datos.
 * @param {string} prompt - Instrucción que describe el análisis.
 * @param {Object} data - JSON de estadísticas que envía el frontend.
 */
async function analyzeWithGPT(prompt, data) {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" }, // FUERZA JSON
      messages: [
        {
          role: "system",
          content: `
Eres un analista experto en fútbol.

SIEMPRE respondes ÚNICAMENTE con JSON válido.
NO agregues texto antes ni después.
El JSON debe tener esta estructura exacta:

{
  "text": "análisis narrativo largo",
  "summary": {
    "title": "Resumen",
    "keyPoints": [],
    "strengths": [],
    "weaknesses": [],
    "recommendations": []
  },
  "charts": {
    "barCharts": [],
    "lineCharts": [],
    "pieCharts": [],
    "radarCharts": []
  },
  "generatedAt": "ISO_DATE_STRING"
}
`,
        },
        {
          role: "user",
          content: `
INSTRUCCIÓN:
${prompt}

ESTADÍSTICAS (JSON):
${JSON.stringify(data)}
`,
        },
      ],
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error(error);
    throw new Error("Error procesando análisis con IA");
  }
}

module.exports = { analyzeWithGPT };
