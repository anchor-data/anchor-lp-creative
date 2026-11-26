-- 取り込み候補を Version × 媒体 に集約する。
-- 広告パラメータが広告ごとに発行される媒体（SmartNews など）では、パラメータ単位だと1つのLPが数千件の
-- 候補に割れ、どれも判定に届かない。sb_creative_id = '*' を「そのVersionの全パラメータ合計」とし、
-- sb_metrics_keyed はパラメータ別の行に加えて '*' の日別合計行を返す（率はPV / 媒体impで加重平均）。
CREATE VIEW sb_metrics_keyed AS
SELECT date, sb_version_id, sb_creative_id, media, spend, pv, click, cv, mcv,
       fver, sver, fsver, oar, ctvr, media_imp, media_ctr, fetched_at
FROM sb_metrics_daily
UNION ALL
SELECT date, sb_version_id, '*' AS sb_creative_id, media,
       SUM(spend), SUM(pv), SUM(click), SUM(cv), SUM(mcv),
       SUM(fver * pv) / NULLIF(SUM(CASE WHEN fver IS NOT NULL THEN pv END), 0),
       SUM(sver * pv) / NULLIF(SUM(CASE WHEN sver IS NOT NULL THEN pv END), 0),
       SUM(fsver * pv) / NULLIF(SUM(CASE WHEN fsver IS NOT NULL THEN pv END), 0),
       SUM(oar * pv) / NULLIF(SUM(CASE WHEN oar IS NOT NULL THEN pv END), 0),
       SUM(ctvr * pv) / NULLIF(SUM(CASE WHEN ctvr IS NOT NULL THEN pv END), 0),
       SUM(media_imp),
       SUM(media_ctr * media_imp) / NULLIF(SUM(CASE WHEN media_ctr IS NOT NULL THEN media_imp END), 0),
       MAX(fetched_at)
FROM sb_metrics_daily
GROUP BY date, sb_version_id, media;

-- パラメータ単位の未処理候補は作り直す（対象外・登録済みは履歴として残す）。
DELETE FROM sb_candidates WHERE status = 'open' AND sb_creative_id <> '*';
