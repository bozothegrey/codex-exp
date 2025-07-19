// db/challengeJobs.js
// Scheduled jobs for challenge maintenance

async function expireChallenges(dbService) {
    await dbService.run(
      `UPDATE challenges SET status = 'expired', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'expired' \
       WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP`
    );
  }

async function closeCertifiedChallenges(dbService) {
    await dbService.run(
      `UPDATE challenges SET status = 'closed', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'certified' \
       WHERE status = 'open' AND challenged_activity_id IN (SELECT activity_id FROM certifications)`
    );
  }

async function resolveChallengesWithNewCertifiedActivities(dbService) {
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
      const sql = `SELECT s.*, ua.id as activity_id
         FROM certifications c
         JOIN user_activities ua ON c.activity_id = ua.id
         JOIN sets s ON JSON_EXTRACT(ua.data, '$.setId') = s.id
         WHERE ua.user_id = ? AND ua.type = 'set_logged' AND s.created_at >= ?`;
      
      
      const certifiedNewerSets = await dbService.query(
        sql,
        [challenge.challenged_user_id, oldSet.created_at]
      );

      console.log(`Checking challenge ${challenge.id} for user ${challenge.challenged_user_id}`);
      console.log('Original set:', oldSet);
      console.log('Certified newer sets:', certifiedNewerSets);
      
      for (const newSet of certifiedNewerSets) {
        console.log(`Comparing new set ${newSet.id} (activity ${newSet.activity_id}) with old set ${oldSet.id}`);
        if (isSetSuperior(newSet, oldSet)) {
          console.log(`Found superior set - resolving challenge ${challenge.id} with activity ${newSet.activity_id}`);
          await dbService.run(
            `UPDATE challenges SET status = 'closed', closed_at = CURRENT_TIMESTAMP, resolution_reason = 'resolved_by_superior', resolving_activity_id = ? WHERE id = ?`,
            [newSet.activity_id, challenge.id]
          );
          break;
        }
      }
    }
  }

function isSetSuperior(newSet, oldSet) {
    // For now: superior if more or eq. reps, with more or eq. weight
    if (newSet.reps >= oldSet.reps && (newSet.weight || 0) >= (oldSet.weight || 0)) return true;    
    return false;
  }

function setupChallengeJobs(dbService, intervalMs = 2 * 60 * 1000) {
  console.log(`[ChallengeJobs] Starting challenge jobs with ${intervalMs/1000}s interval`);
  let jobCount = 0;
  
  setInterval(async () => {
    const jobId = ++jobCount;
    const startTime = new Date();
    console.log(`[ChallengeJobs #${jobId}] Starting at ${startTime.toISOString()}`);
    
    try {
      // Expire old challenges
      console.log(`[ChallengeJobs #${jobId}] Running expireChallenges`);
      const expired = await expireChallenges(dbService);
      
      // Close certified challenges
      console.log(`[ChallengeJobs #${jobId}] Running closeCertifiedChallenges`);
      const certified = await closeCertifiedChallenges(dbService);
      
      // Resolve challenges with new certified activities
      console.log(`[ChallengeJobs #${jobId}] Running resolveChallengesWithNewCertifiedActivities`);
      const resolved = await resolveChallengesWithNewCertifiedActivities(dbService);
      
      const endTime = new Date();
      const duration = endTime - startTime;
      console.log(`[ChallengeJobs #${jobId}] Completed in ${duration}ms at ${endTime.toISOString()}`);
      
    } catch (err) {
      console.error(`[ChallengeJobs #${jobId}] Error:`, err);
    }
  }, intervalMs);
}

module.exports = {
  setupChallengeJobs,
  expireChallenges,
  closeCertifiedChallenges,
  resolveChallengesWithNewCertifiedActivities,
  isSetSuperior
};
