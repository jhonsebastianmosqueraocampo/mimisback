const PRIORITY_LEAGUE_IDS = new Set([
  // ---------- ARGENTINA ----------
  128, // Liga Profesional Argentina
  129, // Primera Nacional
  130, // Copa Argentina
  131, // Primera B Metropolitana
  134, // Torneo Federal A
  483, // Copa de la Superliga
  810, // Super Copa
  1032, // Copa de la Liga Profesional

  // ---------- COLOMBIA ----------
  239, // Primera A
  240, // Primera B
  241, // Copa Colombia
  712, // Liga Femenina
  713, // Superliga

  // ---------- ESPAÑA ----------
  140, // La Liga
  142, // Primera División Femenina
  143, // Copa del Rey
  556, // Supercopa
  1058, // Supercopa Femenina

  // ---------- ITALIA ----------
  135, // Serie A
  137, // Coppa Italia
  547, // Supercoppa
  139, // Serie A Women

  // ---------- ALEMANIA ----------
  78, // Bundesliga
  81, // DFB Pokal
  529, // Super Cup

    // ---------- INGLATERRA ----------
  39, // Premier League
  45, // FA Cup
  48, // League Cup

      // ---------- FRANCIA ----------
  61, // Ligue 1

        // ---------- PORTUGAL ----------
  94, // Primeira Liga

        // ---------- PORTUGAL ----------
  307, // Arabia Saudita
  504, //kingd cup

  // ---------- INTERNACIONALES ----------
  2, // UEFA Champions League
  3, // UEFA Europa League
  21, //copa confederaciones
  4, //Euro Championship
  8, //World Cup - Women
  1, // Mundial
  15, //FIFA Club World Cup
  34, // World Cup - Qualification South America
  848, // UEFA Europa Conference League
  960, // Euro Championship - Qualification
  1191, // UEFA Europa Cup - Women
  11, //CONMEBOL Sudamericana
  926, // Copa America Femenina
  9, // Copa America
  13, // CONMEBOL Libertadores
]);

function isPriorityCompetition(id) {
  return PRIORITY_LEAGUE_IDS.has(Number(id));
}

module.exports = {
  isPriorityCompetition,
  PRIORITY_LEAGUE_IDS,
};