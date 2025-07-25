// utils.js

/**
 * Calculates the estimated 1 Repetition Max (1RM) using the Epley formula.
 * @param {number} weight The weight lifted.
 * @param {number} reps The number of repetitions performed.
 * @returns {number} The estimated 1RM.
 */
function calculate1RM(weight, reps) {
  if (reps === 1) {
    return weight;
  }
  return weight * (1.0 + reps / 30.0);
}

module.exports = {
  calculate1RM,
};
