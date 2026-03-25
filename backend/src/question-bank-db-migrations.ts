function buildSection33QuestionBankSql(schemaName: string) {
  return `
    CREATE TABLE IF NOT EXISTS "${schemaName}"."textbooks" (
      "id" uuid PRIMARY KEY,
      "course_id" varchar(128) NOT NULL,
      "external_id" varchar(128) NOT NULL,
      "title" text NOT NULL,
      "subject" varchar(128) NOT NULL,
      "publisher" text,
      "version" varchar(32) NOT NULL,
      "created_by" varchar(128),
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

    CREATE TABLE IF NOT EXISTS "${schemaName}"."question_bank_textbook_schools" (
      "textbook_id" uuid NOT NULL REFERENCES "${schemaName}"."textbooks"("id") ON DELETE CASCADE,
      "school_id" varchar(128) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("textbook_id", "school_id")
    );

    CREATE INDEX IF NOT EXISTS "idx_qb_textbook_schools_school"
      ON "${schemaName}"."question_bank_textbook_schools" ("school_id");

    CREATE TABLE IF NOT EXISTS "${schemaName}"."assignment_questions" (
      "id" uuid PRIMARY KEY,
      "textbook_id" uuid NOT NULL REFERENCES "${schemaName}"."textbooks"("id") ON DELETE CASCADE,
      "course_id" varchar(128) NOT NULL,
      "chapter_id" uuid REFERENCES "${schemaName}"."chapters"("id") ON DELETE SET NULL,
      "node_type" varchar(16) NOT NULL,
      "parent_id" uuid REFERENCES "${schemaName}"."assignment_questions"("id") ON DELETE CASCADE,
      "question_code" varchar(128) NOT NULL,
      "title" text NOT NULL,
      "description" text NOT NULL,
      "stem" jsonb,
      "prompt" jsonb,
      "standard_answer" jsonb,
      "question_type" varchar(64) NOT NULL,
      "default_score" numeric(8, 2) NOT NULL DEFAULT 0,
      "rubric" jsonb,
      "question_schema" jsonb,
      "grading_policy" jsonb,
      "created_by" varchar(128),
      "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
      "order_no" int,
      "raw_payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "ck_assignment_questions_node_type" CHECK ("node_type" IN ('LEAF', 'GROUP')),
      CONSTRAINT "ck_assignment_questions_status" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
      CONSTRAINT "uq_assignment_questions_textbook_question_code" UNIQUE ("textbook_id", "question_code")
    );

    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_textbook_id"
      ON "${schemaName}"."assignment_questions" ("textbook_id");
    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_course_id"
      ON "${schemaName}"."assignment_questions" ("course_id");
    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_chapter_id"
      ON "${schemaName}"."assignment_questions" ("chapter_id");
    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_parent_id"
      ON "${schemaName}"."assignment_questions" ("parent_id");
    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_node_type"
      ON "${schemaName}"."assignment_questions" ("node_type");
    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_status"
      ON "${schemaName}"."assignment_questions" ("status");
    CREATE INDEX IF NOT EXISTS "idx_assignment_questions_question_code"
      ON "${schemaName}"."assignment_questions" ("question_code");

    CREATE TABLE IF NOT EXISTS "${schemaName}"."question_bank_papers" (
      "id" uuid PRIMARY KEY,
      "school_id" varchar(128),
      "created_by" varchar(128),
      "name" text NOT NULL,
      "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS "idx_question_bank_papers_school_id"
      ON "${schemaName}"."question_bank_papers" ("school_id");
    CREATE INDEX IF NOT EXISTS "idx_question_bank_papers_created_by"
      ON "${schemaName}"."question_bank_papers" ("created_by");
    CREATE INDEX IF NOT EXISTS "idx_question_bank_papers_created_at"
      ON "${schemaName}"."question_bank_papers" ("created_at" DESC);
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
    description: 'create section 3.3 question bank tables',
    up: buildSection33QuestionBankSql,
  },
  {
    id: '202603180002',
    description: 'ensure section 3.3 question bank tables exist',
    up: buildSection33QuestionBankSql,
  },
]
