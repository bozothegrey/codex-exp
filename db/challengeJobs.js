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
      // For now, challenged_activity_id is always a set
      const challengedActivityArr = await dbService.query('SELECT * FROM sets WHERE id = ?', [challenge.challenged_activity_id]);
      if (!challengedActivityArr.length) continue;
      const activity = challengedActivityArr[0];
      // Find certified activities for the same user (challenged_user_id) that were logged after the challenged set
      const certifiedActs = await dbService.query(
        `SELECT c.*, s.*, c.activity_type as cert_activity_type FROM certifications c JOIN sets s ON c.activity_id = s.id WHERE c.certifier_id = ? AND c.activity_type = 'set' AND s.created_at > (
          SELECT created_at FROM sets WHERE id = ?
        )`,
        [challenge.challenged_user_id, challenge.challenged_activity_id]
      );
      for (const certAct of certifiedActs) {
        let isSuperior = false;
        // Only handle 'set' type for now
        if ((activity.type || 'set') === 'set' && (certAct.cert_activity_type || 'set') === 'set') {
          isSuperior = isSetSuperior(certAct, activity);
        } else {
          // Placeholder: add more type resolvers here as needed
          // e.g., if (activity.type === 'run') isSuperior = isRunSuperior(certAct, activity);
        }
        if (isSuperior) {
          await dbService.run(
            `UPDATE challenges SET status = 'closed', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'resolved_by_superior', resolving_activity_id = ? WHERE id = ?`,
            [certAct.id, challenge.id]
          );
          break;
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
