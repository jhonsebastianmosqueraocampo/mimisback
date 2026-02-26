const basePrompt = `
Genera un análisis claro y completo basado únicamente en las estadísticas proporcionadas.

Devuelve SIEMPRE un JSON con la siguiente estructura EXACTA:

{
  "text": "texto narrativo del análisis",
  "summary": {
    "title": "título corto",
    "keyPoints": ["punto1", "punto2"],
    "strengths": ["fortaleza1"],
    "weaknesses": ["debilidad1"],
    "recommendations": ["recomendación1"]
  },
  "charts": {
    "barCharts": [],
    "lineCharts": [],
    "pieCharts": [],
    "radarCharts": [],
    "heatMaps": []
  },
  "generatedAt": "FECHA_ISO"
}

Reglas:
- RESPONDE SOLO el JSON, sin texto antes ni después.
- Si no puedes generar una gráfica, déjala como array vacío.
- Usa únicamente información derivada del JSON.
`;

module.exports = { basePrompt };