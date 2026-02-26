const { basePrompt } = require("./basePrompt");

function playerPrompt(name) {
  return `
${basePrompt}

Ahora genera un análisis del jugador ${name}. 
Incluye:
- estilo de juego
- fortalezas y debilidades reales derivadas de stats
- impacto táctico
- comparativas recientes
- recomendaciones


Gráficos esperados:
- Radar chart con habilidades del jugador
- Bar chart con estadísticas ofensivas
- Line chart de rendimiento reciente
`;
}

module.exports = { playerPrompt };