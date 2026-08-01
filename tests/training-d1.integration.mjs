import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { D1TrainingStore } from "../db/training-store.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

class SqliteStatement {
  constructor(database, query, values = []) { this.database = database; this.query = query; this.values = values; }
  bind(...values) { return new SqliteStatement(this.database, this.query, values); }
  async all() { return { results: this.database.prepare(this.query).all(...this.values) }; }
  async first() { return this.database.prepare(this.query).get(...this.values) ?? null; }
  async run() { return this.database.prepare(this.query).run(...this.values); }
}

class SqliteD1 {
  constructor(database) { this.database = database; }
  prepare(query) { return new SqliteStatement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

test("training migration supports an isolated draft course lifecycle", async (context) => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(await readFile(join(repositoryRoot, "drizzle/0000_identity_foundation.sql"), "utf8"));
    database.exec(await readFile(join(repositoryRoot, "drizzle/0001_training_courses.sql"), "utf8"));

    const user = database.prepare(
      `INSERT INTO users (login_code, display_name, role, password_hash, must_change_password, status)
       VALUES ('COURSEADMIN', 'Synthetic Course Administrator', 'system_admin', 'not-a-real-password-hash', 0, 'active')
       RETURNING id`,
    ).get();
    const course = database.prepare(
      `INSERT INTO courses (slug, title, status, created_by_user_id)
       VALUES ('synthetic-draft', 'دورة اصطناعية', 'draft', ?) RETURNING id, status`,
    ).get(user.id);
    assert.equal(course.status, "draft");

    const question = database.prepare(
      `INSERT INTO course_questions (course_id, position, prompt, correct_option_index, explanation)
       VALUES (?, 1, 'سؤال اصطناعي؟', 1, 'توضيح اصطناعي') RETURNING id`,
    ).get(course.id);
    database.prepare(
      "INSERT INTO course_question_options (question_id, position, label) VALUES (?, 0, 'اختيار أ'), (?, 1, 'اختيار ب')",
    ).run(question.id, question.id);

    assert.equal(database.prepare("SELECT COUNT(*) AS value FROM courses WHERE status = 'draft'").get().value, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS value FROM course_questions").get().value, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS value FROM course_question_options").get().value, 2);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);

    database.prepare("DELETE FROM courses WHERE id = ?").run(course.id);
    assert.equal(database.prepare("SELECT COUNT(*) AS value FROM course_questions").get().value, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS value FROM course_question_options").get().value, 0);
    context.diagnostic("identity and training migrations applied in-memory; draft data and cascades verified");
  } finally {
    database.close();
  }
});

test("training store persists assignment, progress, and server-scored results without leaking answers", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(await readFile(join(repositoryRoot, "drizzle/0000_identity_foundation.sql"), "utf8"));
    database.exec(await readFile(join(repositoryRoot, "drizzle/0001_training_courses.sql"), "utf8"));
    const admin = database.prepare(
      `INSERT INTO users (login_code, display_name, role, password_hash, must_change_password, status)
       VALUES ('ADMIN2', 'Synthetic Administrator', 'system_admin', 'synthetic-hash', 0, 'active') RETURNING id`,
    ).get();
    const driver = database.prepare(
      `INSERT INTO users (login_code, display_name, role, password_hash, must_change_password, status)
       VALUES ('DRIVER2', 'Synthetic Driver', 'driver', 'synthetic-hash', 0, 'active') RETURNING id`,
    ).get();
    const store = new D1TrainingStore(new SqliteD1(database));
    const course = await store.createCourse({
      slug: "store-lifecycle", title: "دورة دورة الحياة", description: "اختبار محلي",
      passPercentage: 80, maxAttempts: 2, quizUnlockPercentage: 80,
      showExplanationsAfterSubmission: true, createdByUserId: Number(admin.id),
    });
    assert.equal(course.videoSourceType, "google_drive");
    assert.equal(course.videoStatus, "awaiting_google_drive_url");
    assert.equal(course.videoSourceRef, null);
    const driveCourse = await store.updateGoogleDriveVideo(course.id, "1AbCdEfGhIjKlMnOpQrStUvWxYz_123");
    assert.equal(driveCourse.videoSourceType, "google_drive");
    assert.equal(driveCourse.videoStatus, "ready");
    assert.equal(driveCourse.videoSourceRef, "1AbCdEfGhIjKlMnOpQrStUvWxYz_123");
    const removedDrive = await store.removeVideoSource(course.id);
    assert.equal(removedDrive.videoStatus, "awaiting_google_drive_url");
    assert.equal(removedDrive.videoSourceRef, null);
    await store.replaceQuestions(course.id, [{
      position: 1, prompt: "ما الاختيار الآمن؟", options: ["أ", "ب"],
      correctOptionIndex: 1, explanation: "ب هو الاختيار الاصطناعي الصحيح.",
    }]);
    await store.updateVideoMetadata(course.id, {
      objectKey: `courses/${course.id}/${"a".repeat(64)}.mp4`, filename: "synthetic.mp4",
      contentType: "video/mp4", sizeBytes: 1024, checksum: "a".repeat(64),
      durationSeconds: 100, codec: "avc1",
    });
    const r2Course = await store.getCourse(course.id);
    assert.equal(r2Course.videoSourceType, "r2");
    assert.equal(r2Course.videoStatus, "ready");
    const managerQuestions = await store.getManagerQuestions(course.id);
    const publicQuestions = await store.getPublicQuestions(course.id);
    assert.equal(managerQuestions[0].correctOptionIndex, 1);
    assert.equal(Object.hasOwn(publicQuestions[0], "correctOptionIndex"), false);
    assert.equal(Object.hasOwn(publicQuestions[0], "explanation"), false);

    const published = await store.updateCourse(course.id, {
      title: course.title, description: course.description, passPercentage: 80,
      maxAttempts: 2, quizUnlockPercentage: 80,
      showExplanationsAfterSubmission: true, passMessage: "نجاح اصطناعي",
      retryMessage: "إعادة اصطناعية", status: "published",
    });
    await store.assignCourse(course.id, [Number(driver.id)], Number(admin.id), null);
    await store.updateProgress(course.id, Number(driver.id), 85, 85);
    const context = { user: { id: Number(driver.id), role: "driver" }, session: { id: 1 } };
    const result = await store.submitQuiz(context, published, [{ questionId: managerQuestions[0].id, selectedOptionIndex: 1 }]);
    assert.equal(result.passed, true);
    assert.equal(result.scorePercentage, 100);
    const report = await store.listCourseAssignments(course.id);
    assert.deepEqual(
      { status: report[0].status, videoPercentage: report[0].videoPercentage, latestScore: report[0].latestScore, attemptCount: report[0].attemptCount },
      { status: "completed", videoPercentage: 85, latestScore: 100, attemptCount: 1 },
    );
  } finally {
    database.close();
  }
});
