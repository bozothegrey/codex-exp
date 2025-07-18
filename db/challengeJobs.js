// db/challengeJobs.js
// Scheduled jobs for challenge maintenance

function setupChallengeJobs(dbService, intervalMs = 60 * 1000) {
  async function expireChallenges() {
    await dbService.run(
      `UPDATE challenges SET status = 'expired', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'expired' \
       WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`
    );
  }

  async function closeCertifiedChallenges() {
    await dbService.run(
      `UPDATE challenges SET status = 'closed', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'certified' \
       WHERE status = 'open' AND challenged_activity_id IN (SELECT activity_id FROM certifications)`
    );
  }

  async function resolveChallengesWithNewCertifiedActivities() {
    const openChallenges = await dbService.query(
      `SELECT * FROM challenges WHERE status = 'open'`
    );
    for (const challenge of openChallenges) {
      // Step 1: Get the original activity and the set it refers to.
      const originalActivity = await dbService.query('SELECT * FROM user_activities WHERE id = ?', [challenge.challenged_activity_id]);
      if (!originalActivity.length) continue;
      
      const originalActivityData = JSON.parse(originalActivity[0].data);
      // The activity must be a 'set_logged' type to have a setId
      if (originalActivity[0].type !== 'set_logged' || !originalActivityData.setId) continue;

      const originalSetArr = await dbService.query('SELECT * FROM sets WHERE id = ?', [originalActivityData.setId]);
      if (!originalSetArr.length) continue;
      const oldSet = originalSetArr[0];

      // Step 2: Find newer, certified activities PERFORMED BY the challenged user.
      // We need to join certifications -> user_activities -> sets
      const certifiedNewerSets = await dbService.query(
        `SELECT s.*, ua.id as activity_id
         FROM certifications c
         JOIN user_activities ua ON c.activity_id = ua.id
         JOIN sets s ON JSON_EXTRACT(ua.data, '$.setId') = s.id
         WHERE ua.user_id = ? AND ua.type = 'set_logged' AND s.created_at > ?`,
        [challenge.challenged_user_id, oldSet.created_at]
      );

      for (const newSet of certifiedNewerSets) {
        if (isSetSuperior(newSet, oldSet)) {
          // Found a superior performance, resolve the challenge
          await dbService.run(
            `UPDATE challenges SET status = 'closed', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'resolved_by_superior', resolving_activity_id = ? WHERE id = ?`,
            [newSet.activity_id, challenge.id] // Use the user_activity_id for resolution tracking
          );
          break; // Move to the next challenge
        }
      }
    }
  }

  function isSetSuperior(newSet, oldSet) {
    // For now: superior if more reps, or same reps but more weight
    if (newSet.reps > oldSet.reps) return true;
    if (newSet.reps === oldSet.reps && (newSet.weight || 0) > (oldSet.weight || 0)) return true;
    return false;
  }

  setInterval(async () => {
    try {
      await expireChallenges();
      await closeCertifiedChallenges();
      await resolveChallengesWithNewCertifiedActivities();
    } catch (err) {
      console.error('Scheduled challenge job error:', err);
    }
  }, intervalMs);
}

module.exports = { setupChallengeJobs };
