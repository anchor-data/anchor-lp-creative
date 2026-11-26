// ORDER BY for the 取り込み候補 › Squad beyond list (no "server-only" so the SQL can be tested).
// Expects `sc` = sb_candidates and `t` = the candidate's totals (spend, cv, mcv, base).

/**
 * Order of the list: hit → fair → pending → miss; within a judgment the best results first
 * (lowest CPA among those with conversions, then MCVR), then by spend.
 */
export const SB_CANDIDATE_ORDER = `CASE sc.judge WHEN 'hit' THEN 0 WHEN 'fair' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
          CASE WHEN COALESCE(t.cv, 0) > 0 THEN 0 ELSE 1 END, t.spend * 1.0 / NULLIF(t.cv, 0),
          t.mcv * 1.0 / NULLIF(t.base, 0) DESC, COALESCE(t.spend, 0) DESC, sc.first_seen_at DESC`;
