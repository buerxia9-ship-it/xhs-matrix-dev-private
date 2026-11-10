-- Schema definitions only; no production rows, keys, personas or materials.
PRAGMA foreign_keys=ON;
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'login_required',
    "cookie" TEXT,
    "fingerprint_id" TEXT,
    "proxy_id" TEXT,
    "persona_id" TEXT,
    "warmup_level" INTEGER NOT NULL DEFAULT 0,
    "daily_quota" INTEGER NOT NULL DEFAULT 2,
    "active_window" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "runMode" TEXT NOT NULL DEFAULT 'semi',
    "gates" TEXT NOT NULL DEFAULT '{}',
    "productName" TEXT,
    "personaId" TEXT,
    "collectAccountIds" TEXT NOT NULL DEFAULT '[]',
    "publishAccountIds" TEXT NOT NULL DEFAULT '[]',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "playbook" TEXT,
    "cadence" TEXT NOT NULL DEFAULT '{}',
    "autopilot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_run_at" DATETIME,
    "next_run_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "collect_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "type" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "comment_insights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "topic" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "sample_ids" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "note_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "author_id" TEXT NOT NULL
);

CREATE TABLE "drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "topic_id" TEXT,
    "persona_id" TEXT NOT NULL,
    "account_id" TEXT,
    "playbook" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "images" TEXT NOT NULL DEFAULT '[]',
    "hashtags" TEXT NOT NULL DEFAULT '[]',
    "compliance_checked" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "fingerprints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ua" TEXT NOT NULL,
    "viewport" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "webgl" TEXT NOT NULL,
    "canvas" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "materials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "tags" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "model_providers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "protocol" TEXT DEFAULT 'openai',
    "api_url" TEXT NOT NULL,
    "api_key" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "models" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider_id" TEXT NOT NULL,
    "name" TEXT,
    "model_name" TEXT NOT NULL,
    "model_type" TEXT NOT NULL DEFAULT 'text',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_providers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "collects" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "images" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "publish_time" DATETIME,
    "collected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL
);

CREATE TABLE "personas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT '',
    "positioning" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "taboo" TEXT NOT NULL DEFAULT '',
    "signature" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT NOT NULL DEFAULT '[]',
    "wiki_space_ids" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE TABLE "proxies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "region" TEXT,
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE "publish_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "draft_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "scheduled_at" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "result" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "run_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "settings" (
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,

    PRIMARY KEY ("group", "key")
);

CREATE TABLE "topics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaign_id" TEXT,
    "title" TEXT NOT NULL,
    "angle" TEXT NOT NULL DEFAULT '',
    "rationale" TEXT NOT NULL DEFAULT '',
    "hot_score" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "warmup_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "wiki_pages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "space_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "page_type" TEXT NOT NULL DEFAULT 'topic',
    "confidence" TEXT,
    "tags" TEXT,
    "content_hash" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "wiki_pages_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "wiki_spaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wiki_pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "wiki_pages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "wiki_spaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "collect_tasks_campaign_id_idx" ON "collect_tasks"("campaign_id");

CREATE INDEX "comments_note_id_idx" ON "comments"("note_id");

CREATE INDEX "materials_campaign_id_idx" ON "materials"("campaign_id");

CREATE INDEX "models_provider_id_idx" ON "models"("provider_id");

CREATE INDEX "publish_jobs_account_id_idx" ON "publish_jobs"("account_id");

CREATE INDEX "run_logs_campaign_id_idx" ON "run_logs"("campaign_id");

CREATE INDEX "warmup_actions_account_id_idx" ON "warmup_actions"("account_id");

CREATE INDEX "wiki_pages_page_type_idx" ON "wiki_pages"("page_type");

CREATE INDEX "wiki_pages_parent_id_idx" ON "wiki_pages"("parent_id");

CREATE INDEX "wiki_pages_space_id_idx" ON "wiki_pages"("space_id");
