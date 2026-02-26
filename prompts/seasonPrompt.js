const { basePrompt } = require("./basePrompt");

function seasonPrompt(team, season) {
  return `
${basePrompt}

Analiza la temporada ${season} del equipo ${team}.
Incluye:
- tendencias
- rendimiento home vs away
- puntos fuertes/débiles
- jugadores clave
- predicción de tendencia

Gráficos esperados:
- Line chart puntos por jornada
- Bar chart goles anotados vs recibidos
- Radar chart perfil táctico del equipo
`;
}

module.exports = { seasonPrompt };