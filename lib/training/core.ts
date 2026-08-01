import { strFromU8, unzipSync } from "fflate";
import { IdentityError, type IdentityRole } from "../identity/core.ts";

export type CourseStatus = "draft" | "published" | "archived";

export interface ImportedQuestion {
  position: number;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface CourseImportPreview {
  title: string;
  declaredQuestionCount: number | null;
  passPercentage: number;
  passMessage: string;
  retryMessage: string;
  questions: ImportedQuestion[];
  issues: string[];
  valid: boolean;
}

export interface QuizQuestionForScoring {
  id: number;
  correctOptionIndex: number;
  explanation: string;
  options: string[];
}

const optionPrefix = /^\s*([أبجدهـو]|[A-Z]|\d+)\s*[\)\.\-:]\s*(.+)$/iu;
const separator = /^-{3,}$/;
const MAX_DOCUMENT_XML_BYTES = 10 * 1024 * 1024;

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function normalized(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function paragraphsFromDocx(input: Uint8Array) {
  let archive: Record<string, Uint8Array>;
  let documentTooLarge = false;
  try {
    archive = unzipSync(input, {
      filter: (file) => {
        if (file.name !== "word/document.xml") return false;
        if (file.originalSize > MAX_DOCUMENT_XML_BYTES) {
          documentTooLarge = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new IdentityError(400, "invalid_docx", "ملف Word غير صالح أو تالف.");
  }
  if (documentTooLarge) {
    throw new IdentityError(413, "docx_content_too_large", "محتوى ملف Word أكبر من الحد المسموح.");
  }
  const document = archive["word/document.xml"];
  if (!document) {
    throw new IdentityError(400, "invalid_docx", "ملف Word لا يحتوي مستندًا قابلًا للقراءة.");
  }
  const xml = strFromU8(document);
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
    .map((paragraph) => [...paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((text) => decodeXml(text[1]))
      .join(""))
    .map(normalized)
    .filter(Boolean);
}

function valueAfterLabel(lines: string[], label: RegExp) {
  const index = lines.findIndex((line) => label.test(line));
  return index >= 0 ? lines[index + 1] ?? "" : "";
}

function collectMessage(lines: string[], label: RegExp) {
  const index = lines.findIndex((line) => label.test(line));
  if (index < 0) return "";
  const values: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (/^رسالة تظهر/u.test(line)) break;
    if (!separator.test(line)) values.push(line);
  }
  return normalized(values.join(" "));
}

export function parseQuestionDocumentParagraphs(sourceLines: string[]): CourseImportPreview {
  const lines = sourceLines.map(normalized).filter(Boolean);
  const issues: string[] = [];
  const title = valueAfterLabel(lines, /^عنوان الاختبار\s*:?$/u);
  const declaredCountLine = lines.find((line) => /^عدد الأسئلة\s*:/u.test(line)) ?? "";
  const declaredQuestionCount = Number(declaredCountLine.match(/\d+/)?.[0] ?? "") || null;
  const passLine = lines.find((line) => /درجة النجاح|نسبة النجاح/u.test(line)) ?? "";
  const passPercentage = Number(passLine.match(/\d+/)?.[0] ?? "80");
  const passMessage = collectMessage(lines, /^رسالة تظهر بعد النجاح\s*:?$/u);
  const retryMessage = collectMessage(lines, /^رسالة تظهر عند عدم النجاح\s*:?$/u);
  const questions: ImportedQuestion[] = [];

  const questionStarts = lines
    .map((line, index) => (/^السؤال\s+\d+\s*:?$/u.test(line) ? index : -1))
    .filter((index) => index >= 0);

  for (let questionIndex = 0; questionIndex < questionStarts.length; questionIndex += 1) {
    const start = questionStarts[questionIndex];
    const end = questionStarts[questionIndex + 1] ?? lines.findIndex(
      (line, index) => index > start && /^رسالة تظهر/u.test(line),
    );
    const block = lines.slice(start + 1, end > start ? end : lines.length)
      .filter((line) => !separator.test(line));
    const answerLabelIndex = block.findIndex((line) => /^الإجابة الصحيحة\s*:?$/u.test(line));
    const explanationIndex = block.findIndex((line) => /^التوضيح\s*:?$/u.test(line));
    const prompt = block.find((line) =>
      !optionPrefix.test(line) &&
      !/^الإجابة الصحيحة|^التوضيح/u.test(line)
    ) ?? "";
    const optionBoundary = answerLabelIndex >= 0 ? answerLabelIndex : block.length;
    const optionLines = block.slice(0, optionBoundary).filter((line) => optionPrefix.test(line));
    const options = optionLines.map((line) => line.match(optionPrefix)?.[2] ?? "");
    const answerLine = answerLabelIndex >= 0 ? block[answerLabelIndex + 1] ?? "" : "";
    const answerMatch = answerLine.match(optionPrefix);
    const answerText = normalized(answerMatch?.[2] ?? answerLine);
    const correctOptionIndex = options.findIndex((option) => normalized(option) === answerText);
    const explanation = explanationIndex >= 0
      ? normalized(block.slice(explanationIndex + 1).filter((line) => !optionPrefix.test(line)).join(" "))
      : "";
    const position = questionIndex + 1;

    if (!prompt) issues.push(`السؤال ${position}: نص السؤال مفقود.`);
    if (options.length < 2) issues.push(`السؤال ${position}: الاختيارات غير مكتملة.`);
    if (correctOptionIndex < 0) issues.push(`السؤال ${position}: الإجابة الصحيحة غير معروفة.`);
    if (!explanation) issues.push(`السؤال ${position}: التوضيح مفقود.`);

    questions.push({ position, prompt, options, correctOptionIndex, explanation });
  }

  if (!title) issues.push("عنوان الاختبار مفقود.");
  if (!declaredQuestionCount) issues.push("عدد الأسئلة المعلن مفقود.");
  if (declaredQuestionCount !== null && declaredQuestionCount !== questions.length) {
    issues.push(`عدد الأسئلة المعلن (${declaredQuestionCount}) لا يطابق المستخرج (${questions.length}).`);
  }
  if (!Number.isInteger(passPercentage) || passPercentage < 1 || passPercentage > 100) {
    issues.push("نسبة النجاح غير صالحة.");
  }
  if (!passMessage) issues.push("رسالة النجاح مفقودة.");
  if (!retryMessage) issues.push("رسالة إعادة المحاولة مفقودة.");

  return {
    title,
    declaredQuestionCount,
    passPercentage,
    passMessage,
    retryMessage,
    questions,
    issues,
    valid: issues.length === 0,
  };
}

export function parseQuestionDocx(input: Uint8Array) {
  return parseQuestionDocumentParagraphs(paragraphsFromDocx(input));
}

export function requireTrainingManager(role: IdentityRole) {
  if (role !== "system_admin" && role !== "supervisor") {
    throw new IdentityError(403, "forbidden", "لا تملك صلاحية إدارة الدورات.");
  }
}

export function validateCoursePolicy(input: {
  passPercentage: number;
  maxAttempts: number | null;
  quizUnlockPercentage: number;
}) {
  if (!Number.isInteger(input.passPercentage) || input.passPercentage < 1 || input.passPercentage > 100) {
    throw new IdentityError(400, "invalid_pass_percentage", "نسبة النجاح يجب أن تكون بين 1 و100.");
  }
  if (input.maxAttempts !== null && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 20)) {
    throw new IdentityError(400, "invalid_attempt_policy", "عدد المحاولات يجب أن يكون بين 1 و20 أو غير محدود.");
  }
  if (!Number.isInteger(input.quizUnlockPercentage) || input.quizUnlockPercentage < 0 || input.quizUnlockPercentage > 100) {
    throw new IdentityError(400, "invalid_unlock_percentage", "نسبة فتح الاختبار يجب أن تكون بين 0 و100.");
  }
}

export function scoreQuiz(
  questions: QuizQuestionForScoring[],
  submittedAnswers: Array<{ questionId: number; selectedOptionIndex: number }>,
  passPercentage: number,
) {
  if (!questions.length) {
    throw new IdentityError(409, "quiz_unavailable", "لا توجد أسئلة معتمدة لهذه الدورة.");
  }
  const answers = new Map(submittedAnswers.map((answer) => [answer.questionId, answer.selectedOptionIndex]));
  if (answers.size !== questions.length || questions.some((question) => !answers.has(question.id))) {
    throw new IdentityError(400, "incomplete_quiz", "يجب الإجابة عن جميع الأسئلة قبل التسليم.");
  }
  const results = questions.map((question) => {
    const selectedOptionIndex = answers.get(question.id)!;
    if (!Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex >= question.options.length) {
      throw new IdentityError(400, "invalid_quiz_answer", "توجد إجابة غير صالحة.");
    }
    return {
      questionId: question.id,
      selectedOptionIndex,
      correct: selectedOptionIndex === question.correctOptionIndex,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
    };
  });
  const correctCount = results.filter((result) => result.correct).length;
  const scorePercentage = Math.round((correctCount / questions.length) * 100);
  return {
    correctCount,
    scorePercentage,
    passed: scorePercentage >= passPercentage,
    results,
  };
}

export function stableCourseObjectKey(courseId: number, checksum: string) {
  if (!Number.isInteger(courseId) || courseId < 1 || !/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new IdentityError(400, "invalid_video_metadata", "بيانات الفيديو غير صالحة.");
  }
  return `courses/${courseId}/${checksum.toLowerCase()}.mp4`;
}
