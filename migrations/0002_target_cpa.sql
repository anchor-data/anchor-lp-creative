-- 目標CPA（組み合わせごと）: 詳細画面の「CPA（目標 ¥X）」と手動判定の参考に使う
ALTER TABLE combinations ADD COLUMN target_cpa INTEGER CHECK (target_cpa IS NULL OR target_cpa >= 0);
