-- F-13 動画の自動解析 and the LP preview (OGP / first-view images) captured with the article.
ALTER TABLE creatives ADD COLUMN analysis_json TEXT;
ALTER TABLE articles ADD COLUMN preview_json TEXT;
ALTER TABLE sb_versions ADD COLUMN preview_json TEXT;

-- Every Version gets its own console URL (the delivery URL is shared by all Versions of a page).
UPDATE sb_versions
SET url = 'https://app.squadbeyond.com/ab_tests/' || page_id || '/versions/swipe?version=' || id
WHERE url IS NULL;

-- beyond's CT (article → product LP click) is the MCV; ctr (= click / pv) is the MCVR.
UPDATE sb_metrics_daily SET mcv = click, mcvr = ctr WHERE mcv IS NULL AND click IS NOT NULL;
