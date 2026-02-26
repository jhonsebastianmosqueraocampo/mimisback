const areJSONEqual = (a, b) => {
  return JSON.stringify(a) === JSON.stringify(b);
}

module.exports = { areJSONEqual };