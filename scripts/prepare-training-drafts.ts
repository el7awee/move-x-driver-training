import { readFile, writeFile } from "node:fs/promises";

type InventoryQuestion = {
  position: number;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
};

type InventoryCourse = {
  title: string;
  slug: string;
  ready: boolean;
  document: {
    passPercentage: number;
    passMessage: string;
    retryMessage: string;
    questions: InventoryQuestion[];
  };
};

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

const [inventoryPath, creatorValue, outputPath] = process.argv.slice(2);
const creatorId = Number(creatorValue);
if (!inventoryPath || !outputPath || !Number.isInteger(creatorId) || creatorId < 1) {
  throw new Error("Usage: prepare-training-drafts <inventory.json> <synthetic-manager-user-id> <output.sql>");
}

const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as { courses?: InventoryCourse[] };
const courses = (inventory.courses ?? []).filter((course) => course.ready);
if (!courses.length) throw new Error("Inventory contains no ready courses");

const statements = [
  "PRAGMA foreign_keys = ON;",
];
for (const course of courses) {
  if (!course.slug || !course.title || !course.document.questions.length) {
    throw new Error(`Ready course is incomplete: ${course.title || course.slug}`);
  }
  statements.push(
    `INSERT INTO courses (slug, title, description, status, pass_percentage, max_attempts, quiz_unlock_percentage, show_explanations_after_submission, pass_message, retry_message, video_source_type, video_source_ref, video_status, created_by_user_id)
     VALUES (${sqlText(course.slug)}, ${sqlText(course.title)}, '', 'draft', ${course.document.passPercentage}, NULL, 80, 1, ${sqlText(course.document.passMessage)}, ${sqlText(course.document.retryMessage)}, 'google_drive', NULL, 'awaiting_google_drive_url', ${creatorId})
     ON CONFLICT(slug) DO NOTHING;`,
  );
  for (const question of course.document.questions) {
    statements.push(
      `INSERT INTO course_questions (course_id, position, prompt, correct_option_index, explanation)
       SELECT c.id, ${question.position}, ${sqlText(question.prompt)}, ${question.correctOptionIndex}, ${sqlText(question.explanation)}
       FROM courses c WHERE c.slug = ${sqlText(course.slug)}
       ON CONFLICT(course_id, position) DO NOTHING;`,
    );
    question.options.forEach((option, position) => statements.push(
      `INSERT INTO course_question_options (question_id, position, label)
       SELECT q.id, ${position}, ${sqlText(option)} FROM course_questions q
       JOIN courses c ON c.id = q.course_id
       WHERE c.slug = ${sqlText(course.slug)} AND q.position = ${question.position}
       ON CONFLICT(question_id, position) DO NOTHING;`,
    ));
  }
}
await writeFile(outputPath, `${statements.join("\n\n")}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(JSON.stringify({ preparedDrafts: courses.length, outputPath }));
