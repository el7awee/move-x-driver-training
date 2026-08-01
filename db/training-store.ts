import type { SessionContext } from "../lib/identity/core.ts";
import {
  scoreQuiz,
  type CourseStatus,
  type ImportedQuestion,
  type QuizQuestionForScoring,
} from "../lib/training/core.ts";
import type { VideoSourceType, VideoStatus } from "../lib/training/video-source.ts";

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

export interface CourseRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: CourseStatus;
  passPercentage: number;
  maxAttempts: number | null;
  quizUnlockPercentage: number;
  showExplanationsAfterSubmission: boolean;
  passMessage: string;
  retryMessage: string;
  videoSourceType: VideoSourceType;
  videoSourceRef: string | null;
  videoStatus: VideoStatus;
  videoObjectKey: string | null;
  videoFilename: string | null;
  videoContentType: string | null;
  videoSizeBytes: number | null;
  videoChecksum: string | null;
  videoDurationSeconds: number | null;
  videoCodec: string | null;
  createdByUserId: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function courseFromRow(row: Record<string, unknown>): CourseRecord {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description ?? ""),
    status: String(row.status) as CourseStatus,
    passPercentage: Number(row.pass_percentage),
    maxAttempts: row.max_attempts === null ? null : Number(row.max_attempts),
    quizUnlockPercentage: Number(row.quiz_unlock_percentage),
    showExplanationsAfterSubmission: Boolean(row.show_explanations_after_submission),
    passMessage: String(row.pass_message ?? ""),
    retryMessage: String(row.retry_message ?? ""),
    videoSourceType: String(row.video_source_type) as VideoSourceType,
    videoSourceRef: row.video_source_ref === null ? null : String(row.video_source_ref),
    videoStatus: String(row.video_status) as VideoStatus,
    videoObjectKey: row.video_object_key === null ? null : String(row.video_object_key),
    videoFilename: row.video_filename === null ? null : String(row.video_filename),
    videoContentType: row.video_content_type === null ? null : String(row.video_content_type),
    videoSizeBytes: row.video_size_bytes === null ? null : Number(row.video_size_bytes),
    videoChecksum: row.video_checksum === null ? null : String(row.video_checksum),
    videoDurationSeconds: row.video_duration_seconds === null ? null : Number(row.video_duration_seconds),
    videoCodec: row.video_codec === null ? null : String(row.video_codec),
    createdByUserId: Number(row.created_by_user_id),
    publishedAt: row.published_at === null ? null : String(row.published_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class D1TrainingStore {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async listCourses(context: SessionContext) {
    const manager = context.user.role === "system_admin" || context.user.role === "supervisor";
    const statement = manager
      ? this.db.prepare(
          "SELECT c.*, (SELECT COUNT(*) FROM course_questions q WHERE q.course_id = c.id) AS question_count FROM courses c ORDER BY c.created_at DESC",
        )
      : this.db.prepare(
          `SELECT c.*, a.status AS assignment_status, a.due_at,
             COALESCE(p.video_percentage, 0) AS video_percentage,
             (SELECT COUNT(*) FROM course_questions q WHERE q.course_id = c.id) AS question_count
           FROM courses c
           JOIN course_assignments a ON a.course_id = c.id
           LEFT JOIN course_progress p ON p.course_id = c.id AND p.user_id = a.user_id
           WHERE a.user_id = ? AND a.status != 'cancelled' AND c.status = 'published'
           ORDER BY a.created_at DESC`,
        ).bind(context.user.id);
    const result = await statement.all<Record<string, unknown>>();
    return result.results.map((row: Record<string, unknown>) => ({
      ...courseFromRow(row),
      questionCount: Number(row.question_count ?? 0),
      assignmentStatus: row.assignment_status ? String(row.assignment_status) : null,
      dueAt: row.due_at ? String(row.due_at) : null,
      videoPercentage: Number(row.video_percentage ?? 0),
    }));
  }

  async getCourse(courseId: number) {
    const row = await this.db.prepare("SELECT * FROM courses WHERE id = ?").bind(courseId).first<Record<string, unknown>>();
    return row ? courseFromRow(row) : null;
  }

  async getDriverAccess(courseId: number, userId: number) {
    return this.db.prepare(
      `SELECT a.status AS assignment_status, COALESCE(p.video_percentage, 0) AS video_percentage,
         COALESCE((SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.course_id = a.course_id AND qa.user_id = a.user_id), 0) AS attempt_count
       FROM course_assignments a
       LEFT JOIN course_progress p ON p.course_id = a.course_id AND p.user_id = a.user_id
       WHERE a.course_id = ? AND a.user_id = ? AND a.status != 'cancelled'`,
    ).bind(courseId, userId).first<Record<string, unknown>>();
  }

  async createCourse(input: {
    slug: string;
    title: string;
    description: string;
    passPercentage: number;
    maxAttempts: number | null;
    quizUnlockPercentage: number;
    showExplanationsAfterSubmission: boolean;
    passMessage?: string;
    retryMessage?: string;
    createdByUserId: number;
  }) {
    const result = await this.db.prepare(
      `INSERT INTO courses (
        slug, title, description, status, pass_percentage, max_attempts,
        quiz_unlock_percentage, show_explanations_after_submission, pass_message, retry_message,
        created_by_user_id
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).bind(
      input.slug,
      input.title,
      input.description,
      input.passPercentage,
      input.maxAttempts,
      input.quizUnlockPercentage,
      input.showExplanationsAfterSubmission ? 1 : 0,
      input.passMessage ?? "",
      input.retryMessage ?? "",
      input.createdByUserId,
    ).first<Record<string, unknown>>();
    if (!result) throw new Error("Course insert returned no row");
    return courseFromRow(result);
  }

  async updateCourse(courseId: number, input: {
    title: string;
    description: string;
    passPercentage: number;
    maxAttempts: number | null;
    quizUnlockPercentage: number;
    showExplanationsAfterSubmission: boolean;
    passMessage: string;
    retryMessage: string;
    status: CourseStatus;
  }) {
    const publishedAt = input.status === "published" ? new Date().toISOString() : null;
    const row = await this.db.prepare(
      `UPDATE courses SET title = ?, description = ?, pass_percentage = ?, max_attempts = ?,
        quiz_unlock_percentage = ?, show_explanations_after_submission = ?, pass_message = ?, retry_message = ?, status = ?,
        published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ).bind(
      input.title,
      input.description,
      input.passPercentage,
      input.maxAttempts,
      input.quizUnlockPercentage,
      input.showExplanationsAfterSubmission ? 1 : 0,
      input.passMessage,
      input.retryMessage,
      input.status,
      input.status,
      publishedAt,
      courseId,
    ).first<Record<string, unknown>>();
    return row ? courseFromRow(row) : null;
  }

  async courseReadiness(courseId: number) {
    return this.db.prepare(
      `SELECT
        EXISTS(SELECT 1 FROM courses c WHERE c.id = ? AND c.video_status = 'ready' AND (
          (c.video_source_type = 'google_drive' AND c.video_source_ref IS NOT NULL) OR
          (c.video_source_type = 'r2' AND c.video_object_key IS NOT NULL)
        )) AS has_video,
        (SELECT COUNT(*) FROM course_questions q WHERE q.course_id = ?) AS question_count,
        (SELECT COUNT(*) FROM course_questions q WHERE q.course_id = ? AND
          (q.correct_option_index < 0 OR q.correct_option_index >=
            (SELECT COUNT(*) FROM course_question_options o WHERE o.question_id = q.id))) AS invalid_questions`,
    ).bind(courseId, courseId, courseId).first<Record<string, unknown>>();
  }

  async replaceQuestions(courseId: number, questions: ImportedQuestion[]) {
    const statements: D1PreparedStatementLike[] = [
      this.db.prepare(
        "DELETE FROM course_question_options WHERE question_id IN (SELECT id FROM course_questions WHERE course_id = ?)",
      ).bind(courseId),
      this.db.prepare("DELETE FROM course_questions WHERE course_id = ?").bind(courseId),
    ];
    for (const question of questions) {
      statements.push(this.db.prepare(
        `INSERT INTO course_questions (course_id, position, prompt, correct_option_index, explanation)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(courseId, question.position, question.prompt, question.correctOptionIndex, question.explanation));
      question.options.forEach((option, position) => {
        statements.push(this.db.prepare(
          `INSERT INTO course_question_options (question_id, position, label)
           VALUES ((SELECT id FROM course_questions WHERE course_id = ? AND position = ?), ?, ?)`,
        ).bind(courseId, question.position, position, option));
      });
    }
    await this.db.batch(statements);
  }

  async getQuestions(courseId: number): Promise<QuizQuestionForScoring[]> {
    const rows = await this.db.prepare(
      `SELECT q.id, q.correct_option_index, q.explanation, o.position, o.label
       FROM course_questions q
       JOIN course_question_options o ON o.question_id = q.id
       WHERE q.course_id = ?
       ORDER BY q.position, o.position`,
    ).bind(courseId).all<Record<string, unknown>>();
    const questions = new Map<number, QuizQuestionForScoring>();
    for (const row of rows.results) {
      const id = Number(row.id);
      const question = questions.get(id) ?? {
        id,
        correctOptionIndex: Number(row.correct_option_index),
        explanation: String(row.explanation ?? ""),
        options: [],
      };
      question.options[Number(row.position)] = String(row.label);
      questions.set(id, question);
    }
    return [...questions.values()];
  }

  async getPublicQuestions(courseId: number) {
    const rows = await this.db.prepare(
      `SELECT q.id, q.position AS question_position, q.prompt,
         o.position AS option_position, o.label
       FROM course_questions q
       JOIN course_question_options o ON o.question_id = q.id
       WHERE q.course_id = ?
       ORDER BY q.position, o.position`,
    ).bind(courseId).all<Record<string, unknown>>();
    const questions = new Map<number, { id: number; position: number; prompt: string; options: string[] }>();
    for (const row of rows.results) {
      const id = Number(row.id);
      const question = questions.get(id) ?? {
        id,
        position: Number(row.question_position),
        prompt: String(row.prompt),
        options: [],
      };
      question.options[Number(row.option_position)] = String(row.label);
      questions.set(id, question);
    }
    return [...questions.values()];
  }

  async getManagerQuestions(courseId: number) {
    const rows = await this.db.prepare(
      `SELECT q.id, q.position AS question_position, q.prompt, q.correct_option_index, q.explanation,
         o.position AS option_position, o.label
       FROM course_questions q
       JOIN course_question_options o ON o.question_id = q.id
       WHERE q.course_id = ?
       ORDER BY q.position, o.position`,
    ).bind(courseId).all<Record<string, unknown>>();
    const questions = new Map<number, ImportedQuestion & { id: number }>();
    for (const row of rows.results) {
      const id = Number(row.id);
      const question = questions.get(id) ?? {
        id,
        position: Number(row.question_position),
        prompt: String(row.prompt),
        correctOptionIndex: Number(row.correct_option_index),
        explanation: String(row.explanation ?? ""),
        options: [],
      };
      question.options[Number(row.option_position)] = String(row.label);
      questions.set(id, question);
    }
    return [...questions.values()];
  }

  async listActiveDrivers() {
    const rows = await this.db.prepare(
      `SELECT id, login_code, display_name
       FROM users WHERE role = 'driver' AND status = 'active'
       ORDER BY display_name, id`,
    ).all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: Number(row.id),
      loginCode: String(row.login_code),
      displayName: String(row.display_name),
    }));
  }

  async listCourseAssignments(courseId: number) {
    const rows = await this.db.prepare(
      `SELECT a.user_id, u.login_code, u.display_name, a.status, a.due_at, a.created_at,
         COALESCE(p.video_percentage, 0) AS video_percentage,
         (SELECT qa.score_percentage FROM quiz_attempts qa
          WHERE qa.course_id = a.course_id AND qa.user_id = a.user_id
          ORDER BY qa.attempt_number DESC LIMIT 1) AS latest_score,
         (SELECT COUNT(*) FROM quiz_attempts qa
          WHERE qa.course_id = a.course_id AND qa.user_id = a.user_id) AS attempt_count
       FROM course_assignments a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN course_progress p ON p.course_id = a.course_id AND p.user_id = a.user_id
       WHERE a.course_id = ?
       ORDER BY a.created_at DESC`,
    ).bind(courseId).all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      userId: Number(row.user_id),
      loginCode: String(row.login_code),
      displayName: String(row.display_name),
      status: String(row.status),
      dueAt: row.due_at === null ? null : String(row.due_at),
      videoPercentage: Number(row.video_percentage),
      latestScore: row.latest_score === null ? null : Number(row.latest_score),
      attemptCount: Number(row.attempt_count),
    }));
  }

  async updateVideoMetadata(courseId: number, input: {
    objectKey: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    checksum: string;
    durationSeconds: number | null;
    codec: string | null;
  }) {
    return this.db.prepare(
      `UPDATE courses SET video_source_type = 'r2', video_source_ref = ?, video_status = 'ready',
        video_object_key = ?, video_filename = ?, video_content_type = ?,
        video_size_bytes = ?, video_checksum = ?, video_duration_seconds = ?, video_codec = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING video_object_key`,
    ).bind(
      input.objectKey,
      input.objectKey,
      input.filename,
      input.contentType,
      input.sizeBytes,
      input.checksum,
      input.durationSeconds,
      input.codec,
      courseId,
    ).first<{ video_object_key: string }>();
  }

  async updateGoogleDriveVideo(courseId: number, fileId: string) {
    const row = await this.db.prepare(
      `UPDATE courses SET video_source_type = 'google_drive', video_source_ref = ?, video_status = 'ready',
        video_filename = NULL, video_content_type = NULL, video_size_bytes = NULL,
        video_checksum = NULL, video_duration_seconds = NULL, video_codec = NULL,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ).bind(fileId, courseId).first<Record<string, unknown>>();
    return row ? courseFromRow(row) : null;
  }

  async removeVideoSource(courseId: number) {
    const row = await this.db.prepare(
      `UPDATE courses SET video_source_type = 'google_drive', video_source_ref = NULL,
        video_status = 'awaiting_google_drive_url', video_filename = NULL,
        video_content_type = NULL, video_size_bytes = NULL, video_checksum = NULL,
        video_duration_seconds = NULL, video_codec = NULL,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? RETURNING *`,
    ).bind(courseId).first<Record<string, unknown>>();
    return row ? courseFromRow(row) : null;
  }

  async assignCourse(courseId: number, userIds: number[], assignedByUserId: number, dueAt: string | null) {
    const statements = userIds.map((userId) => this.db.prepare(
      `INSERT INTO course_assignments (course_id, user_id, assigned_by_user_id, due_at)
       SELECT ?, u.id, ?, ? FROM users u WHERE u.id = ? AND u.role = 'driver' AND u.status = 'active'
       ON CONFLICT(course_id, user_id) DO UPDATE SET
         assigned_by_user_id = excluded.assigned_by_user_id,
         due_at = excluded.due_at,
         status = 'assigned'`,
    ).bind(courseId, assignedByUserId, dueAt, userId));
    if (statements.length) await this.db.batch(statements);
  }

  async updateProgress(courseId: number, userId: number, videoSeconds: number, videoPercentage: number) {
    await this.db.prepare(
      `INSERT INTO course_progress (course_id, user_id, video_seconds, video_percentage)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(course_id, user_id) DO UPDATE SET
         video_seconds = MAX(course_progress.video_seconds, excluded.video_seconds),
         video_percentage = MAX(course_progress.video_percentage, excluded.video_percentage),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(courseId, userId, videoSeconds, videoPercentage).run();
  }

  async submitQuiz(context: SessionContext, course: CourseRecord, submittedAnswers: Array<{ questionId: number; selectedOptionIndex: number }>) {
    const access = await this.getDriverAccess(course.id, context.user.id);
    if (!access) throw new Error("Course assignment unavailable");
    if (Number(access.video_percentage) < course.quizUnlockPercentage) {
      throw new Error("Video progress is below the quiz unlock threshold");
    }
    const attemptCount = Number(access.attempt_count);
    if (course.maxAttempts !== null && attemptCount >= course.maxAttempts) {
      throw new Error("Quiz attempt limit reached");
    }
    const questions = await this.getQuestions(course.id);
    const scored = scoreQuiz(questions, submittedAnswers, course.passPercentage);
    const attemptNumber = attemptCount + 1;
    const statements: D1PreparedStatementLike[] = [
      this.db.prepare(
        `INSERT INTO quiz_attempts (course_id, user_id, attempt_number, score_percentage, passed)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(course.id, context.user.id, attemptNumber, scored.scorePercentage, scored.passed ? 1 : 0),
    ];
    for (const answer of scored.results) {
      statements.push(this.db.prepare(
        `INSERT INTO quiz_answers (attempt_id, question_id, selected_option_index, correct)
         VALUES ((SELECT id FROM quiz_attempts WHERE course_id = ? AND user_id = ? AND attempt_number = ?), ?, ?, ?)`,
      ).bind(course.id, context.user.id, attemptNumber, answer.questionId, answer.selectedOptionIndex, answer.correct ? 1 : 0));
    }
    if (scored.passed) {
      statements.push(
        this.db.prepare(
          "UPDATE course_assignments SET status = 'completed' WHERE course_id = ? AND user_id = ?",
        ).bind(course.id, context.user.id),
        this.db.prepare(
          `UPDATE course_progress SET completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE course_id = ? AND user_id = ?`,
        ).bind(course.id, context.user.id),
      );
    }
    await this.db.batch(statements);
    return {
      attemptNumber,
      scorePercentage: scored.scorePercentage,
      passed: scored.passed,
      correctCount: scored.correctCount,
      results: course.showExplanationsAfterSubmission ? scored.results : scored.results.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionIndex: answer.selectedOptionIndex,
        correct: answer.correct,
      })),
    };
  }
}
