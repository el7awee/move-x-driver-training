import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";

import {
  parseQuestionDocumentParagraphs,
  parseQuestionDocx,
  requireTrainingManager,
  scoreQuiz,
  stableCourseObjectKey,
  validateCoursePolicy,
} from "../lib/training/core.ts";
import { parseByteRange, safeVideoFilename } from "../lib/training/video.ts";

const validDocument = [
  "عنوان الاختبار:",
  "اختبار تجريبي",
  "عدد الأسئلة: 2 سؤالًا",
  "درجة النجاح المقترحة: 80%",
  "السؤال 1:",
  "ما التصرف الصحيح؟",
  "أ) تجاهل المشكلة",
  "ب) توقف وأبلغ المشرف",
  "الإجابة الصحيحة:",
  "ب) توقف وأبلغ المشرف",
  "التوضيح:",
  "الإبلاغ يحافظ على السلامة.",
  "السؤال 2:",
  "متى تبدأ الحركة؟",
  "أ) بعد إتمام الفحص",
  "ب) فورًا",
  "الإجابة الصحيحة:",
  "أ) بعد إتمام الفحص",
  "التوضيح:",
  "الفحص يسبق الحركة.",
  "رسالة تظهر بعد النجاح:",
  "أحسنت.",
  "رسالة تظهر عند عدم النجاح:",
  "راجع الفيديو ثم حاول مرة أخرى.",
];

test("DOCX question parser preserves Arabic content and policies", () => {
  const parsed = parseQuestionDocumentParagraphs(validDocument);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, "اختبار تجريبي");
  assert.equal(parsed.questions.length, 2);
  assert.deepEqual(parsed.questions[0].options, ["تجاهل المشكلة", "توقف وأبلغ المشرف"]);
  assert.equal(parsed.questions[0].correctOptionIndex, 1);
  assert.equal(parsed.questions[0].explanation, "الإبلاغ يحافظ على السلامة.");
  assert.equal(parsed.passPercentage, 80);
});

test("DOCX question parser rejects a missing correct answer and count mismatch", () => {
  const broken = validDocument
    .filter((line) => line !== "ب) توقف وأبلغ المشرف")
    .map((line) => line.replace("2 سؤالًا", "3 أسئلة"));
  const parsed = parseQuestionDocumentParagraphs(broken);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.issues.some((issue) => issue.includes("الإجابة الصحيحة")));
  assert.ok(parsed.issues.some((issue) => issue.includes("لا يطابق")));
});

test("DOCX parser rejects oversized expanded XML before decompression", () => {
  const oversized = zipSync({
    "word/document.xml": strToU8("x".repeat(10 * 1024 * 1024 + 1)),
  });
  assert.throws(() => parseQuestionDocx(oversized), /أكبر من الحد/);
});

test("quiz scoring stays server-side and returns results only after submission", () => {
  const result = scoreQuiz(
    [
      { id: 10, correctOptionIndex: 1, explanation: "شرح 1", options: ["أ", "ب"] },
      { id: 11, correctOptionIndex: 0, explanation: "شرح 2", options: ["أ", "ب"] },
    ],
    [
      { questionId: 10, selectedOptionIndex: 1 },
      { questionId: 11, selectedOptionIndex: 1 },
    ],
    80,
  );
  assert.equal(result.scorePercentage, 50);
  assert.equal(result.passed, false);
  assert.deepEqual(result.results.map((answer) => answer.correct), [true, false]);
});

test("course policy and manager authorization are enforced", () => {
  validateCoursePolicy({ passPercentage: 80, maxAttempts: 3, quizUnlockPercentage: 80 });
  assert.doesNotThrow(() => requireTrainingManager("system_admin"));
  assert.doesNotThrow(() => requireTrainingManager("supervisor"));
  assert.throws(() => requireTrainingManager("driver"), /صلاحية إدارة الدورات/);
  assert.throws(
    () => validateCoursePolicy({ passPercentage: 0, maxAttempts: 3, quizUnlockPercentage: 80 }),
    /نسبة النجاح/,
  );
});

test("video object keys are stable and reject path-like input", () => {
  const checksum = "a".repeat(64);
  assert.equal(stableCourseObjectKey(42, checksum), `courses/42/${checksum}.mp4`);
  assert.throws(() => stableCourseObjectKey(42, "../../video"), /بيانات الفيديو/);
});

test("video ranges support normal, open, and suffix requests", () => {
  assert.deepEqual(parseByteRange("bytes=10-19", 100), { start: 10, end: 19, length: 10 });
  assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99, length: 10 });
  assert.deepEqual(parseByteRange("bytes=-12", 100), { start: 88, end: 99, length: 12 });
  assert.throws(() => parseByteRange("bytes=100-110", 100), /نطاق الفيديو/);
});

test("video filenames cannot escape the stable object-key namespace", () => {
  assert.equal(safeVideoFilename("../../ملف:تدريب.mp4"), "..-..-ملف-تدريب.mp4");
});
