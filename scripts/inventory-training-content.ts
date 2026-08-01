import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseQuestionDocx } from "../lib/training/core.ts";

interface VideoMetadata {
  filename: string;
  sizeBytes: number;
  durationSeconds: number | null;
  codec: string | null;
  checksum: string;
}

async function checksum(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function inspectMp4(buffer: Buffer) {
  let durationSeconds: number | null = null;
  let codec: string | null = null;
  for (let offset = 0; offset + 8 <= buffer.length;) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (size < 8 || offset + size > buffer.length) break;
    if (type === "moov") {
      const end = offset + size;
      for (let child = offset + 8; child + 8 <= end;) {
        const childSize = buffer.readUInt32BE(child);
        const childType = buffer.toString("ascii", child + 4, child + 8);
        if (childSize < 8 || child + childSize > end) break;
        if (childType === "mvhd") {
          const version = buffer[child + 8];
          const timescaleOffset = version === 1 ? child + 28 : child + 20;
          const durationOffset = version === 1 ? child + 32 : child + 24;
          const timescale = buffer.readUInt32BE(timescaleOffset);
          const duration = version === 1
            ? Number(buffer.readBigUInt64BE(durationOffset))
            : buffer.readUInt32BE(durationOffset);
          if (timescale > 0 && Number.isFinite(duration)) {
            durationSeconds = Math.round((duration / timescale) * 100) / 100;
          }
        }
        child += childSize;
      }
    }
    offset += size;
  }
  for (const candidate of ["avc1", "hvc1", "hev1", "av01", "vp09", "mp4v"]) {
    if (buffer.indexOf(candidate, 0, "ascii") >= 0) {
      codec = candidate;
      break;
    }
  }
  return { durationSeconds, codec };
}

function stableSlug(title: string) {
  return `mx-${createHash("sha256").update(title.normalize("NFKC")).digest("hex").slice(0, 16)}`;
}

async function inspectFolder(folderPath: string) {
  const files = await readdir(folderPath, { withFileTypes: true });
  const mp4Files = files.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"));
  const docxFiles = files.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".docx"));
  const errors: string[] = [];
  if (mp4Files.length !== 1) errors.push(`Expected one MP4; found ${mp4Files.length}.`);
  if (docxFiles.length !== 1) errors.push(`Expected one DOCX; found ${docxFiles.length}.`);

  let video: VideoMetadata | null = null;
  if (mp4Files.length === 1) {
    const videoPath = path.join(folderPath, mp4Files[0].name);
    const info = await stat(videoPath);
    const bytes = await readFile(videoPath);
    const metadata = inspectMp4(bytes);
    video = {
      filename: mp4Files[0].name,
      sizeBytes: info.size,
      ...metadata,
      checksum: await checksum(videoPath),
    };
    if (!metadata.durationSeconds) errors.push("Could not read MP4 duration.");
    if (!metadata.codec) errors.push("Could not identify MP4 video codec.");
  }

  let document: ReturnType<typeof parseQuestionDocx> | null = null;
  if (docxFiles.length === 1) {
    const docxPath = path.join(folderPath, docxFiles[0].name);
    try {
      const bytes = await readFile(docxPath);
      if (!bytes.length) throw new Error("DOCX is empty.");
      document = parseQuestionDocx(bytes);
      errors.push(...document.issues);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "DOCX could not be parsed.");
    }
  }

  const title = path.basename(folderPath);
  return {
    title,
    slug: stableSlug(title),
    folderPath,
    video,
    document: document ? {
      title: document.title,
      declaredQuestionCount: document.declaredQuestionCount,
      extractedQuestionCount: document.questions.length,
      passPercentage: document.passPercentage,
      passMessage: document.passMessage,
      retryMessage: document.retryMessage,
      valid: document.valid,
      questions: document.questions,
    } : null,
    ready: errors.length === 0 && Boolean(video && document?.valid),
    errors,
  };
}

async function main() {
  const source = path.resolve(process.argv[2] ?? "");
  const output = process.argv[3] ? path.resolve(process.argv[3]) : null;
  if (!source) throw new Error("Usage: inventory-training-content.ts <source-directory> [output.json]");
  const entries = await readdir(source, { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const courses = [];
  for (const folder of folders) courses.push(await inspectFolder(path.join(source, folder.name)));
  const report = {
    source,
    generatedAt: new Date().toISOString(),
    folderCount: folders.length,
    readyCount: courses.filter((course) => course.ready).length,
    failedCount: courses.filter((course) => !course.ready).length,
    courses,
  };
  const json = JSON.stringify(report, null, 2);
  if (output) await writeFile(output, json, "utf8");
  else process.stdout.write(json);
}

await main();
