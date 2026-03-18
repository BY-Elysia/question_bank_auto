function buildCreateQuestionBankTablesSql(schemaName: string) {
  return `
    CREATE TABLE IF NOT EXISTS "${schemaName}"."textbooks" (
      "id" uuid PRIMARY KEY,
      "course_id" varchar(128) NOT NULL,
      "external_id" varchar(128) NOT NULL,
      "title" text NOT NULL,
      "subject" varchar(128) NOT NULL,
      "publisher" text,
      "version" varchar(32) NOT NULL,
      "source_file_name" text NOT NULL,
      "raw_payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_textbooks_course_external" UNIQUE ("course_id", "external_id")
    );

    CREATE TABLE IF NOT EXISTS "${schemaName}"."chapters" (
      "id" uuid PRIMARY KEY,
      "textbook_id" uuid NOT NULL REFERENCES "${schemaName}"."textbooks"("id") ON DELETE CASCADE,
      "external_id" varchar(128) NOT NULL,
      "parent_id" uuid REFERENCES "${schemaName}"."chapters"("id") ON DELETE SET NULL,
      "title" text NOT NULL,
      "order_no" int NOT NULL DEFAULT 0,
      "raw_payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "uq_chapters_textbook_external" UNIQUE ("textbook_id", "external_id")
    );

    CREATE INDEX IF NOT EXISTS "idx_chapters_textbook_id" ON "${schemaName}"."chapters" ("textbook_id");
    CREATE INDEX IF NOT EXISTS "idx_chapters_parent_id" ON "${schemaName}"."chapters" ("parent_id");

    CREATE TABLE IF NOT EXISTS "${schemaName}"."question_bank_questions" (
      "id" uuid PRIMARY KEY,
      "textbook_id" uuid NOT NULL REFERENCES "${schemaName}"."textbooks"("id") ON DELETE CASCADE,
      "course_id" varchar(128) NOT NULL,
      "external_id" varchar(128) NOT NULL,
      "chapter_id" uuid REFERENCES "${schemaName}"."chapters"("id") ON DELETE SET NULL,
      "node_type" varchar(16) NOT NULL,
      "parent_id" uuid REFERENCES "${schemaName}"."question_bank_questions"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "description" text NOT NULL,
      "stem_json" jsonb,
      "prompt_json" jsonb,
      "standard_answer_json" jsonb,
      "question_type" varchar(64) NOT NULL,
      "question_schema_json" jsonb,
      "grading_policy_json" jsonb,
      "default_score" numeric(8, 2) NOT NULL DEFAULT 0,
      "rubric_json" jsonb,
      "order_no" int,
      "raw_payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "ck_question_bank_questions_node_type" CHECK ("node_type" IN ('LEAF', 'GROUP')),
      CONSTRAINT "uq_question_bank_questions_textbook_external" UNIQUE ("textbook_id", "external_id")
    );

    CREATE INDEX IF NOT EXISTS "idx_question_bank_questions_textbook_id" ON "${schemaName}"."question_bank_questions" ("textbook_id");
    CREATE INDEX IF NOT EXISTS "idx_question_bank_questions_chapter_id" ON "${schemaName}"."question_bank_questions" ("chapter_id");
    CREATE INDEX IF NOT EXISTS "idx_question_bank_questions_parent_id" ON "${schemaName}"."question_bank_questions" ("parent_id");
    CREATE INDEX IF NOT EXISTS "idx_question_bank_questions_node_type" ON "${schemaName}"."question_bank_questions" ("node_type");

    CREATE TABLE IF NOT EXISTS "${schemaName}"."question_bank_import_runs" (
      "id" uuid PRIMARY KEY,
      "textbook_id" uuid NOT NULL REFERENCES "${schemaName}"."textbooks"("id") ON DELETE CASCADE,
      "source_file_name" text NOT NULL,
      "imported_at" timestamptz NOT NULL DEFAULT now(),
      "chapter_count" int NOT NULL DEFAULT 0,
      "question_row_count" int NOT NULL DEFAULT 0,
      "leaf_question_count" int NOT NULL DEFAULT 0,
      "group_question_count" int NOT NULL DEFAULT 0,
      "child_question_count" int NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS "idx_question_bank_import_runs_textbook_id" ON "${schemaName}"."question_bank_import_runs" ("textbook_id");
    CREATE INDEX IF NOT EXISTS "idx_question_bank_import_runs_imported_at" ON "${schemaName}"."question_bank_import_runs" ("imported_at" DESC);
  `
}

export type QuestionBankMigration = {
  id: string
  description: string
  up: (schemaName: string) => string
}

export const questionBankMigrations: QuestionBankMigration[] = [
  {
    id: '202603180001',
    description: 'create question bank tables',
    up: buildCreateQuestionBankTablesSql,
  },
]
