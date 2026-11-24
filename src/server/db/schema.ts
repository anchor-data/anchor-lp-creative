// Drizzle mirror of migrations/0001_init.sql (the SQL file is the source of truth).
// The vector column `combinations.embedding` is accessed with raw SQL only.
import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["viewer", "editor", "admin"] }).notNull().default("viewer"),
  isActive: integer("is_active").notNull().default(1),
  lastSeenAt: text("last_seen_at"),
  ...timestamps,
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ownerUserId: text("owner_user_id"),
  isActive: integer("is_active").notNull().default(1),
  ...timestamps,
});

export const judgeRules = sqliteTable(
  "judge_rules",
  {
    categoryId: text("category_id").notNull(),
    metric: text("metric", { enum: ["spend", "cpa", "mcvr", "cv", "fsver", "oar"] }).notNull(),
    enabled: integer("enabled").notNull().default(1),
    direction: text("direction", { enum: ["gte", "lte"] }).notNull(),
    hitValue: real("hit_value"),
    fairValue: real("fair_value"),
    earlyValue: real("early_value"),
    updatedBy: text("updated_by"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.metric] })],
);

export const judgeSettings = sqliteTable("judge_settings", {
  categoryId: text("category_id").primaryKey(),
  windowType: text("window_type", { enum: ["cumulative", "last_n_days"] }).notNull().default("cumulative"),
  windowDays: integer("window_days"),
  minDays: integer("min_days").notNull().default(7),
  minSpend: integer("min_spend").notNull().default(0),
  earlyDays: integer("early_days").notNull().default(30),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const tagTypes = sqliteTable("tag_types", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  required: integer("required").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  tagTypeId: text("tag_type_id").notNull(),
  name: text("name").notNull(),
  isActive: integer("is_active").notNull().default(1),
  mergedIntoId: text("merged_into_id"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const ngExpressions = sqliteTable("ng_expressions", {
  id: text("id").primaryKey(),
  categoryId: text("category_id"),
  phrase: text("phrase").notNull(),
  matchType: text("match_type", { enum: ["contains", "regex"] }).notNull().default("contains"),
  law: text("law"),
  alternative: text("alternative"),
  severity: text("severity", { enum: ["warn", "ng"] }).notNull(),
  isActive: integer("is_active").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  categoryId: text("category_id").notNull(),
  targetGender: text("target_gender"),
  targetAge: text("target_age"),
  targetPain: text("target_pain"),
  priceRange: text("price_range"),
  offer: text("offer"),
  usp: text("usp"),
  createdBy: text("created_by").notNull(),
  ...timestamps,
  deletedAt: text("deleted_at"),
});

export const creatives = sqliteTable("creatives", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  kind: text("kind", { enum: ["video", "banner"] }).notNull(),
  r2Key: text("r2_key"),
  sourceUrl: text("source_url"),
  fileSha256: text("file_sha256"),
  thumbnailR2Key: text("thumbnail_r2_key"),
  durationSec: real("duration_sec"),
  width: integer("width"),
  height: integer("height"),
  mainCopy: text("main_copy"),
  scriptJson: text("script_json"),
  sbCreativeId: text("sb_creative_id"),
  analysisJson: text("analysis_json"),
  createdBy: text("created_by").notNull(),
  ...timestamps,
  deletedAt: text("deleted_at"),
});

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  url: text("url").notNull(),
  finalLpUrl: text("final_lp_url"),
  title: text("title"),
  screenshotR2Key: text("screenshot_r2_key"),
  fvR2Key: text("fv_r2_key"),
  bodyText: text("body_text"),
  blocksJson: text("blocks_json"),
  sbPageId: text("sb_page_id"),
  sbVersionId: text("sb_version_id"),
  previewJson: text("preview_json"),
  capturedAt: text("captured_at"),
  createdBy: text("created_by").notNull(),
  ...timestamps,
  deletedAt: text("deleted_at"),
});

export const combinations = sqliteTable("combinations", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  creativeId: text("creative_id").notNull(),
  articleId: text("article_id").notNull(),
  media: text("media").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  origin: text("origin", { enum: ["own", "market"] }).notNull(),
  metricsSource: text("metrics_source", { enum: ["sb", "manual", "csv", "dpro"] }).notNull(),
  sbVersionId: text("sb_version_id"),
  sbCreativeId: text("sb_creative_id"),
  dproAdId: text("dpro_ad_id"),
  judgeAuto: text("judge_auto", { enum: ["hit", "fair", "miss", "pending"] }),
  judgeBasisJson: text("judge_basis_json"),
  judgedAt: text("judged_at"),
  judgeManual: text("judge_manual", { enum: ["hit", "fair", "miss"] }),
  judgeManualReason: text("judge_manual_reason"),
  judgeManualBy: text("judge_manual_by"),
  judgeManualAt: text("judge_manual_at"),
  targetCpa: integer("target_cpa"),
  generationVersionId: text("generation_version_id"),
  searchText: text("search_text"),
  embeddingModel: text("embedding_model"),
  embeddingUpdatedAt: text("embedding_updated_at"),
  recBonus: real("rec_bonus").notNull().default(0),
  createdBy: text("created_by").notNull(),
  ...timestamps,
  deletedAt: text("deleted_at"),
});

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),
  combinationId: text("combination_id").notNull(),
  kind: text("kind", { enum: ["win", "next", "miss"] }).notNull(),
  body: text("body").notNull(),
  createdBy: text("created_by").notNull(),
  ...timestamps,
});

export const creativeTags = sqliteTable(
  "creative_tags",
  {
    creativeId: text("creative_id").notNull(),
    tagId: text("tag_id").notNull(),
    source: text("source", { enum: ["ai", "human"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.creativeId, t.tagId] })],
);

export const articleTags = sqliteTable(
  "article_tags",
  {
    articleId: text("article_id").notNull(),
    tagId: text("tag_id").notNull(),
    source: text("source", { enum: ["ai", "human"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const manualMetrics = sqliteTable("manual_metrics", {
  id: text("id").primaryKey(),
  combinationId: text("combination_id").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  spend: integer("spend"),
  imp: integer("imp"),
  click: integer("click"),
  pv: integer("pv"),
  cv: integer("cv"),
  mcv: integer("mcv"),
  fsver: real("fsver"),
  oar: real("oar"),
  videoViewRate: real("video_view_rate"),
  source: text("source", { enum: ["manual", "csv"] }).notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const marketMetrics = sqliteTable(
  "market_metrics",
  {
    combinationId: text("combination_id").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    estSpend: integer("est_spend"),
    deliveryDays: integer("delivery_days"),
    views: integer("views"),
    likeRate: real("like_rate"),
  },
  (t) => [primaryKey({ columns: [t.combinationId, t.snapshotDate] })],
);

export const sbPages = sqliteTable("sb_pages", {
  id: text("id").primaryKey(),
  name: text("name"),
  folder: text("folder"),
  status: text("status"),
  url: text("url"),
  productId: text("product_id"),
  rawJson: text("raw_json"),
  syncedAt: text("synced_at").notNull(),
});

export const sbVersions = sqliteTable("sb_versions", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  name: text("name"),
  url: text("url"),
  bodyText: text("body_text"),
  previewJson: text("preview_json"),
  rawJson: text("raw_json"),
  syncedAt: text("synced_at").notNull(),
});

export const sbCreatives = sqliteTable("sb_creatives", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  name: text("name"),
  parameter: text("parameter"),
  rawJson: text("raw_json"),
  syncedAt: text("synced_at").notNull(),
});

export const sbMetricsDaily = sqliteTable(
  "sb_metrics_daily",
  {
    date: text("date").notNull(),
    sbVersionId: text("sb_version_id").notNull(),
    sbCreativeId: text("sb_creative_id").notNull(),
    media: text("media").notNull(),
    spend: integer("spend"),
    pv: integer("pv"),
    click: integer("click"),
    ctr: real("ctr"),
    cv: integer("cv"),
    cvr: real("cvr"),
    ctvr: real("ctvr"),
    cpa: integer("cpa"),
    mcv: integer("mcv"),
    mcvr: real("mcvr"),
    mcpa: integer("mcpa"),
    fver: real("fver"),
    sver: real("sver"),
    fsver: real("fsver"),
    oar: real("oar"),
    mediaImp: integer("media_imp"),
    mediaCtr: real("media_ctr"),
    mediaCpm: integer("media_cpm"),
    mediaCpc: integer("media_cpc"),
    rawJson: text("raw_json"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.sbVersionId, t.sbCreativeId, t.media] })],
);

export const sbCandidates = sqliteTable("sb_candidates", {
  id: text("id").primaryKey(),
  sbVersionId: text("sb_version_id").notNull(),
  sbCreativeId: text("sb_creative_id").notNull(),
  media: text("media").notNull(),
  categoryId: text("category_id"),
  judge: text("judge", { enum: ["hit", "fair", "miss", "pending"] }).notNull(),
  summaryJson: text("summary_json").notNull(),
  status: text("status", { enum: ["open", "registered", "dismissed"] }).notNull().default("open"),
  dismissReason: text("dismiss_reason"),
  dismissedBy: text("dismissed_by"),
  combinationId: text("combination_id"),
  firstSeenAt: text("first_seen_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const dproConditions = sqliteTable("dpro_conditions", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  dproGenre: text("dpro_genre"),
  keywordsJson: text("keywords_json"),
  mediaJson: text("media_json"),
  minEstSpend: integer("min_est_spend"),
  minDays: integer("min_days"),
  topN: integer("top_n").notNull().default(20),
  lpType: text("lp_type", { enum: ["article_only", "any"] }).notNull().default("article_only"),
  isActive: integer("is_active").notNull().default(1),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export const dproCandidates = sqliteTable("dpro_candidates", {
  id: text("id").primaryKey(),
  dproAdId: text("dpro_ad_id").notNull().unique(),
  conditionId: text("condition_id"),
  categoryId: text("category_id"),
  advertiser: text("advertiser"),
  productName: text("product_name"),
  media: text("media"),
  adText: text("ad_text"),
  narration: text("narration"),
  durationSec: real("duration_sec"),
  aspect: text("aspect"),
  firstSeenDate: text("first_seen_date"),
  lastSeenDate: text("last_seen_date"),
  estSpend: integer("est_spend"),
  deliveryDays: integer("delivery_days"),
  views: integer("views"),
  likeRate: real("like_rate"),
  thumbnailUrl: text("thumbnail_url"),
  dproDetailUrl: text("dpro_detail_url"),
  lpUrl: text("lp_url"),
  lpText: text("lp_text"),
  lpType: text("lp_type", { enum: ["article", "product", "unknown"] }),
  aiTagsJson: text("ai_tags_json"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: text("reviewed_at"),
  rejectReason: text("reject_reason"),
  rawJson: text("raw_json"),
  fetchedAt: text("fetched_at").notNull(),
});

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  productId: text("product_id"),
  inputJson: text("input_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const generationVersions = sqliteTable("generation_versions", {
  id: text("id").primaryKey(),
  generationId: text("generation_id").notNull(),
  versionNo: integer("version_no").notNull(),
  plansJson: text("plans_json").notNull(),
  winPlaybookId: text("win_playbook_id"),
  avoidPlaybookId: text("avoid_playbook_id"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const generationRefs = sqliteTable(
  "generation_refs",
  {
    generationVersionId: text("generation_version_id").notNull(),
    combinationId: text("combination_id").notNull(),
    rank: integer("rank").notNull(),
    score: real("score"),
    pickedBy: text("picked_by", { enum: ["auto", "user"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.generationVersionId, t.combinationId] })],
);

export const playbooks = sqliteTable("playbooks", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull(),
  kind: text("kind", { enum: ["win", "avoid"] }).notNull(),
  versionNo: integer("version_no").notNull(),
  status: text("status", { enum: ["draft", "approved", "rejected", "superseded"] }).notNull(),
  bodyMd: text("body_md").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  changeNote: text("change_note"),
  draftedBy: text("drafted_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  createdAt: text("created_at").notNull(),
});

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  payloadJson: text("payload_json").notNull(),
  sbCandidateId: text("sb_candidate_id"),
  updatedAt: text("updated_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  at: text("at").notNull(),
  userId: text("user_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
});

export const jobRuns = sqliteTable("job_runs", {
  id: text("id").primaryKey(),
  job: text("job").notNull(),
  targetDate: text("target_date"),
  status: text("status", { enum: ["running", "succeeded", "failed", "skipped"] }).notNull(),
  attempt: integer("attempt").notNull().default(1),
  items: integer("items"),
  error: text("error"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const apiUsage = sqliteTable(
  "api_usage",
  {
    provider: text("provider").notNull(),
    date: text("date").notNull(),
    minute: text("minute").notNull().default(""),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.provider, t.date, t.minute] })],
);
