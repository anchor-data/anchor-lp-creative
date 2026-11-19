-- Spec ch.5 DDL (第1版). Keep in sync with src/server/db/schema.ts.
-- マスタ ----------------------------------------------------------
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor','admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  owner_user_id TEXT REFERENCES users(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (parent_id, name)
);

CREATE TABLE judge_rules (
  category_id TEXT NOT NULL REFERENCES categories(id),
  metric TEXT NOT NULL CHECK (metric IN ('spend','cpa','mcvr','cv','fsver','oar')),
  enabled INTEGER NOT NULL DEFAULT 1,
  direction TEXT NOT NULL CHECK (direction IN ('gte','lte')),
  hit_value REAL,
  fair_value REAL,
  early_value REAL,
  updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL,
  PRIMARY KEY (category_id, metric)
);

CREATE TABLE judge_settings (
  category_id TEXT PRIMARY KEY REFERENCES categories(id),
  window_type TEXT NOT NULL DEFAULT 'cumulative' CHECK (window_type IN ('cumulative','last_n_days')),
  window_days INTEGER,
  min_days INTEGER NOT NULL DEFAULT 7,
  min_spend INTEGER NOT NULL DEFAULT 0,
  early_days INTEGER NOT NULL DEFAULT 30,
  updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
);

CREATE TABLE tag_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  tag_type_id TEXT NOT NULL REFERENCES tag_types(id),
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  merged_into_id TEXT REFERENCES tags(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tag_type_id, name)
);

CREATE TABLE ng_expressions (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES categories(id),
  phrase TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','regex')),
  law TEXT,
  alternative TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('warn','ng')),
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
);

-- 事例 ----------------------------------------------------------
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  target_gender TEXT, target_age TEXT, target_pain TEXT,
  price_range TEXT, offer TEXT, usp TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE creatives (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  kind TEXT NOT NULL CHECK (kind IN ('video','banner')),
  r2_key TEXT,
  source_url TEXT,
  file_sha256 TEXT,
  thumbnail_r2_key TEXT,
  duration_sec REAL, width INTEGER, height INTEGER,
  main_copy TEXT,
  script_json TEXT,
  sb_creative_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (r2_key IS NOT NULL OR source_url IS NOT NULL)
);
CREATE UNIQUE INDEX creatives_sha_uq ON creatives(file_sha256) WHERE file_sha256 IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  url TEXT NOT NULL,
  final_lp_url TEXT,
  title TEXT,
  screenshot_r2_key TEXT,
  fv_r2_key TEXT,
  body_text TEXT,
  blocks_json TEXT,
  sb_page_id TEXT, sb_version_id TEXT,
  captured_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX articles_url_idx ON articles(url);

CREATE TABLE combinations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  creative_id TEXT NOT NULL REFERENCES creatives(id),
  article_id TEXT NOT NULL REFERENCES articles(id),
  media TEXT NOT NULL,
  start_date TEXT NOT NULL, end_date TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('own','market')),
  metrics_source TEXT NOT NULL CHECK (metrics_source IN ('sb','manual','csv','dpro')),
  sb_version_id TEXT, sb_creative_id TEXT,
  dpro_ad_id TEXT,
  judge_auto TEXT CHECK (judge_auto IN ('hit','fair','miss','pending')),
  judge_basis_json TEXT,
  judged_at TEXT,
  judge_manual TEXT CHECK (judge_manual IN ('hit','fair','miss')),
  judge_manual_reason TEXT, judge_manual_by TEXT REFERENCES users(id), judge_manual_at TEXT,
  generation_version_id TEXT REFERENCES generation_versions(id),
  search_text TEXT,
  embedding F32_BLOB(1024),
  embedding_model TEXT, embedding_updated_at TEXT,
  rec_bonus REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX comb_sb_uq ON combinations(sb_version_id, sb_creative_id, media) WHERE sb_version_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX comb_dpro_uq ON combinations(dpro_ad_id) WHERE dpro_ad_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX comb_list_idx ON combinations(origin, judge_auto, created_at);
CREATE INDEX comb_vec_idx ON combinations(libsql_vector_idx(embedding, 'metric=cosine'));

CREATE TABLE memos (
  id TEXT PRIMARY KEY,
  combination_id TEXT NOT NULL REFERENCES combinations(id),
  kind TEXT NOT NULL CHECK (kind IN ('win','next','miss')),
  body TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE creative_tags (
  creative_id TEXT NOT NULL REFERENCES creatives(id), tag_id TEXT NOT NULL REFERENCES tags(id),
  source TEXT NOT NULL CHECK (source IN ('ai','human')),
  PRIMARY KEY (creative_id, tag_id)
);
CREATE TABLE article_tags (
  article_id TEXT NOT NULL REFERENCES articles(id), tag_id TEXT NOT NULL REFERENCES tags(id),
  source TEXT NOT NULL CHECK (source IN ('ai','human')),
  PRIMARY KEY (article_id, tag_id)
);

CREATE TABLE manual_metrics (
  id TEXT PRIMARY KEY,
  combination_id TEXT NOT NULL REFERENCES combinations(id),
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  spend INTEGER, imp INTEGER, click INTEGER, pv INTEGER, cv INTEGER, mcv INTEGER,
  fsver REAL, oar REAL, video_view_rate REAL,
  source TEXT NOT NULL CHECK (source IN ('manual','csv')),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);

CREATE TABLE market_metrics (
  combination_id TEXT NOT NULL REFERENCES combinations(id),
  snapshot_date TEXT NOT NULL,
  est_spend INTEGER, delivery_days INTEGER, views INTEGER, like_rate REAL,
  PRIMARY KEY (combination_id, snapshot_date)
);

-- Squad beyond --------------------------------------------------
CREATE TABLE sb_pages (
  id TEXT PRIMARY KEY, name TEXT, folder TEXT, status TEXT, url TEXT,
  product_id TEXT REFERENCES products(id),
  raw_json TEXT, synced_at TEXT NOT NULL
);
CREATE TABLE sb_versions (
  id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES sb_pages(id),
  name TEXT, url TEXT, body_text TEXT, raw_json TEXT, synced_at TEXT NOT NULL
);
CREATE TABLE sb_creatives (
  id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES sb_pages(id),
  name TEXT, parameter TEXT, raw_json TEXT, synced_at TEXT NOT NULL
);

CREATE TABLE sb_metrics_daily (
  date TEXT NOT NULL,
  sb_version_id TEXT NOT NULL, sb_creative_id TEXT NOT NULL, media TEXT NOT NULL,
  spend INTEGER, pv INTEGER, click INTEGER, ctr REAL, cv INTEGER, cvr REAL, ctvr REAL,
  cpa INTEGER, mcv INTEGER, mcvr REAL, mcpa INTEGER,
  fver REAL, sver REAL, fsver REAL, oar REAL,
  media_imp INTEGER, media_ctr REAL, media_cpm INTEGER, media_cpc INTEGER,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (date, sb_version_id, sb_creative_id, media)
);
CREATE INDEX sbm_combo_idx ON sb_metrics_daily(sb_version_id, sb_creative_id, media, date);

CREATE TABLE sb_candidates (
  id TEXT PRIMARY KEY,
  sb_version_id TEXT NOT NULL, sb_creative_id TEXT NOT NULL, media TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  judge TEXT NOT NULL CHECK (judge IN ('hit','fair','miss','pending')),
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','registered','dismissed')),
  dismiss_reason TEXT, dismissed_by TEXT REFERENCES users(id),
  combination_id TEXT REFERENCES combinations(id),
  first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (sb_version_id, sb_creative_id, media)
);

-- DPro ------------------------------------------------------------
CREATE TABLE dpro_conditions (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  dpro_genre TEXT, keywords_json TEXT, media_json TEXT,
  min_est_spend INTEGER, min_days INTEGER, top_n INTEGER NOT NULL DEFAULT 20,
  lp_type TEXT NOT NULL DEFAULT 'article_only' CHECK (lp_type IN ('article_only','any')),
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
);

CREATE TABLE dpro_candidates (
  id TEXT PRIMARY KEY,
  dpro_ad_id TEXT NOT NULL UNIQUE,
  condition_id TEXT REFERENCES dpro_conditions(id),
  category_id TEXT REFERENCES categories(id),
  advertiser TEXT, product_name TEXT, media TEXT,
  ad_text TEXT, narration TEXT, duration_sec REAL, aspect TEXT,
  first_seen_date TEXT, last_seen_date TEXT,
  est_spend INTEGER, delivery_days INTEGER, views INTEGER, like_rate REAL,
  thumbnail_url TEXT, dpro_detail_url TEXT,
  lp_url TEXT, lp_text TEXT,
  lp_type TEXT CHECK (lp_type IN ('article','product','unknown')),
  ai_tags_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id), reviewed_at TEXT, reject_reason TEXT,
  raw_json TEXT, fetched_at TEXT NOT NULL
);

-- 生成・知見 --------------------------------------------------------
CREATE TABLE generations (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id),
  input_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE generation_versions (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES generations(id),
  version_no INTEGER NOT NULL,
  plans_json TEXT NOT NULL,
  win_playbook_id TEXT REFERENCES playbooks(id),
  avoid_playbook_id TEXT REFERENCES playbooks(id),
  model TEXT, prompt_version TEXT,
  input_tokens INTEGER, output_tokens INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
  UNIQUE (generation_id, version_no)
);
CREATE TABLE generation_refs (
  generation_version_id TEXT NOT NULL REFERENCES generation_versions(id),
  combination_id TEXT NOT NULL REFERENCES combinations(id),
  rank INTEGER NOT NULL, score REAL,
  picked_by TEXT NOT NULL CHECK (picked_by IN ('auto','user')),
  PRIMARY KEY (generation_version_id, combination_id)
);

CREATE TABLE playbooks (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  kind TEXT NOT NULL CHECK (kind IN ('win','avoid')),
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','rejected','superseded')),
  body_md TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  change_note TEXT,
  drafted_by TEXT NOT NULL,
  approved_by TEXT REFERENCES users(id), approved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (category_id, kind, version_no)
);

-- その他 ----------------------------------------------------------
CREATE TABLE collections (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id),
  combination_id TEXT NOT NULL REFERENCES combinations(id),
  added_at TEXT NOT NULL, PRIMARY KEY (collection_id, combination_id)
);
CREATE TABLE drafts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  payload_json TEXT NOT NULL, sb_candidate_id TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE csv_mappings (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, mapping_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, at TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT,
  before_json TEXT, after_json TEXT
);
CREATE INDEX audit_at_idx ON audit_logs(at);
CREATE TABLE job_runs (
  id TEXT PRIMARY KEY, job TEXT NOT NULL, target_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','skipped')),
  attempt INTEGER NOT NULL DEFAULT 1, items INTEGER, error TEXT,
  started_at TEXT NOT NULL, finished_at TEXT
);
CREATE INDEX job_runs_idx ON job_runs(job, target_date);
CREATE TABLE api_usage (
  provider TEXT NOT NULL, date TEXT NOT NULL, minute TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (provider, date, minute)
);
