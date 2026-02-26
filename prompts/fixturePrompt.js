const { basePrompt } = require("./basePrompt");

function fixturePrompt(fixtureId) {
  return `
${basePrompt}

Genera un análisis del partido ID ${fixtureId}.
Incluir:
- análisis táctico
- dominio por fases
- comparación entre equipos (tiros, posesión, xG)
- jugadores clave
- momentos decisivos
- no incluir el fixtureId en el análisis

Formato de respuesta (JSON):

Gráficos esperados:
- Bar chart comparación entre equipos
- Pie chart posesión
- Line chart evolución del partido
`;
}

module.exports = { fixturePrompt };