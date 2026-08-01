"use client";

import { useEffect, useRef, useState } from "react";

type Course = {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  passPercentage: number;
  maxAttempts: number | null;
  quizUnlockPercentage: number;
  showExplanationsAfterSubmission: boolean;
  videoFilename: string | null;
  videoDurationSeconds: number | null;
  videoPercentage?: number;
  questionCount?: number;
};

type Question = {
  id?: number;
  position: number;
  prompt: string;
  options: string[];
  correctOptionIndex?: number;
  explanation?: string;
};

type Driver = { id: number; loginCode: string; displayName: string };
type Assignment = Driver & {
  userId: number;
  status: string;
  dueAt: string | null;
  videoPercentage: number;
  latestScore: number | null;
  attemptCount: number;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error ?? "تعذر إتمام الطلب.");
  return body;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function videoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = () => { URL.revokeObjectURL(url); video.remove(); };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      finish();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("تعذر قراءة مدة الفيديو."));
    };
    video.onerror = () => { finish(); reject(new Error("ملف الفيديو غير قابل للقراءة.")); };
    video.src = url;
  });
}

export function TrainingWorkspace({ manager, notify }: { manager: boolean; notify: (message: string) => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest<{ courses: Course[] }>("/api/training/courses", { cache: "no-store" });
      setCourses(data.courses);
      if (selectedId && !data.courses.some((course) => course.id === selectedId)) setSelectedId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "تعذر تحميل الدورات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedId) {
    return <CourseWorkspace
      key={selectedId}
      courseId={selectedId}
      manager={manager}
      back={() => { setSelectedId(null); void refresh(); }}
      notify={notify}
    />;
  }

  return <div className="page-stack">
    <div className="page-head admin-head">
      <div><span className="section-kicker">بيانات حقيقية من D1</span><h1>{manager ? "إدارة الدورات" : "دوراتي"}</h1><p>{manager ? "أنشئ وراجع المحتوى كمسودة قبل نشره." : "الدورات المنشورة والمخصصة لك فقط."}</p></div>
      <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>تحديث</button>
    </div>
    {manager && <CreateCourse onCreated={(course) => { setCourses((items) => [course, ...items]); setSelectedId(course.id); }} />}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <article className="card training-empty">جارٍ تحميل الدورات…</article> : courses.length === 0
      ? <article className="card training-empty">{manager ? "لا توجد دورات بعد. أنشئ أول مسودة." : "لا توجد دورات مخصصة لك حاليًا."}</article>
      : <div className="course-list">{courses.map((course) => <article className="course-card card" key={course.id}>
          <div className="course-card-body">
            <span className="status-label">{course.status === "draft" ? "مسودة" : course.status === "published" ? "منشورة" : "مؤرشفة"}</span>
            <h2>{course.title}</h2><p>{course.description || "لا يوجد وصف."}</p>
            <div className="mini-meta"><span>{course.questionCount ?? 0} سؤال</span><span>النجاح {course.passPercentage}%</span></div>
            {!manager && <><div className="progress-track"><i style={{ width: `${course.videoPercentage ?? 0}%` }}/></div><span>{course.videoPercentage ?? 0}% مشاهدة</span></>}
            <button className="primary-button" onClick={() => setSelectedId(course.id)}>{manager ? "مراجعة وإدارة" : "فتح الدورة"}</button>
          </div>
        </article>)}</div>}
  </div>;
}

function CreateCourse({ onCreated }: { onCreated: (course: Course) => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    const normalized = title.trim();
    if (!normalized) return;
    setBusy(true); setError("");
    try {
      const slug = `course-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const data = await jsonRequest<{ course: Course }>("/api/training/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title: normalized }),
      });
      onCreated(data.course);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر إنشاء الدورة."); }
    finally { setBusy(false); }
  }
  return <article className="card training-create"><label>عنوان دورة جديدة<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180}/></label><button className="primary-button" onClick={() => void create()} disabled={busy || !title.trim()}>{busy ? "جارٍ الإنشاء…" : "+ إنشاء مسودة"}</button>{error && <p className="form-error">{error}</p>}</article>;
}

function CourseWorkspace({ courseId, manager, back, notify }: { courseId: number; manager: boolean; back: () => void; notify: (message: string) => void }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizUnlocked, setQuizUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<{ scorePercentage: number; passed: boolean } | null>(null);
  const progressSentAt = useRef(0);

  async function load() {
    setError("");
    try {
      const data = await jsonRequest<{ course: Course; questions: Question[]; quizUnlocked: boolean; videoPercentage: number }>(`/api/training/courses/${courseId}`, { cache: "no-store" });
      setCourse({ ...data.course, videoPercentage: data.videoPercentage });
      setQuestions(data.questions);
      setQuizUnlocked(data.quizUnlocked);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر تحميل الدورة."); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!course) return <div className="page-stack"><button className="back-button" onClick={back}>العودة</button><article className="card training-empty">{error || "جارٍ تحميل الدورة…"}</article></div>;
  if (manager) return <ManagerCourseEditor course={course} questions={questions} setQuestions={setQuestions} back={back} reload={load} notify={notify}/>;

  async function saveProgress(seconds: number) {
    const now = Date.now();
    if (now - progressSentAt.current < 5000) return;
    progressSentAt.current = now;
    try {
      await jsonRequest(`/api/training/courses/${courseId}/progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoSeconds: Math.floor(seconds) }) });
    } catch { /* A later timeupdate or explicit refresh retries without blocking playback. */ }
  }
  async function submitQuiz() {
    if (questions.some((question) => answers[question.id!] === undefined)) return;
    setBusy(true); setError("");
    try {
      const data = await jsonRequest<{ result: { scorePercentage: number; passed: boolean } }>(`/api/training/courses/${courseId}/attempts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: questions.map((question) => ({ questionId: question.id, selectedOptionIndex: answers[question.id!] })) }),
      });
      setResult(data.result); notify("تم حفظ نتيجة الاختبار");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر تسليم الاختبار."); }
    finally { setBusy(false); }
  }
  return <div className="page-stack"><button className="back-button" onClick={back}>العودة إلى الدورات</button>
    <section className="card training-editor"><h1>{course.title}</h1><p>{course.description}</p>
      {course.videoFilename ? <video className="training-video" controls preload="metadata" src={`/api/training/courses/${course.id}/video`} onTimeUpdate={(event) => void saveProgress(event.currentTarget.currentTime)} onEnded={(event) => { progressSentAt.current = 0; void saveProgress(event.currentTarget.duration); void load(); }}/> : <p className="form-error">الفيديو غير متاح.</p>}
      <p>يفتح الاختبار بعد مشاهدة {course.quizUnlockPercentage}% من الفيديو.</p>
      {!quizUnlocked && <button className="secondary-button" onClick={() => void load()}>تحديث التقدم</button>}
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {quizUnlocked && questions.length > 0 && <section className="card training-editor"><h2>اختبار الدورة</h2>{questions.map((question) => <fieldset key={question.id} className="training-question"><legend>{question.position}. {question.prompt}</legend>{question.options.map((option, index) => <label key={index}><input type="radio" name={`q-${question.id}`} checked={answers[question.id!] === index} onChange={() => setAnswers((value) => ({ ...value, [question.id!]: index }))}/>{option}</label>)}</fieldset>)}<button className="primary-button" disabled={busy || questions.some((question) => answers[question.id!] === undefined)} onClick={() => void submitQuiz()}>{busy ? "جارٍ الحفظ…" : "تسليم الاختبار"}</button>{result && <p className={result.passed ? "training-success" : "form-error"}>النتيجة {result.scorePercentage}% — {result.passed ? "ناجح" : "لم تحقق نسبة النجاح"}</p>}</section>}
  </div>;
}

function ManagerCourseEditor({ course, questions, setQuestions, back, reload, notify }: { course: Course; questions: Question[]; setQuestions: (questions: Question[]) => void; back: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [draft, setDraft] = useState(course);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedDrivers, setSelectedDrivers] = useState<number[]>([]);
  const readyToPublish = Boolean(course.videoFilename && questions.length);

  useEffect(() => {
    void Promise.all([
      jsonRequest<{ drivers: Driver[] }>("/api/training/drivers").then((data) => setDrivers(data.drivers)),
      jsonRequest<{ assignments: Assignment[] }>(`/api/training/courses/${course.id}/assignments`).then((data) => setAssignments(data.assignments)),
    ]).catch(() => undefined);
  }, [course.id]);

  async function saveMetadata(status = draft.status) {
    setBusy(true); setError("");
    try {
      await jsonRequest(`/api/training/courses/${course.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, status }) });
      notify(status === "published" ? "تم نشر الدورة" : "تم حفظ الدورة"); await reload();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر حفظ الدورة."); }
    finally { setBusy(false); }
  }
  async function importDocx(file: File) {
    setBusy(true); setError("");
    try {
      const data = await jsonRequest<{ preview: { valid: boolean; issues: string[]; title: string; passPercentage: number; questions: Question[] } }>("/api/training/import-docx", { method: "POST", headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, body: file });
      setQuestions(data.preview.questions); setDraft((value) => ({ ...value, passPercentage: data.preview.passPercentage })); notify("تم تحليل Word؛ راجع الأسئلة ثم احفظها");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر تحليل Word."); }
    finally { setBusy(false); }
  }
  async function saveQuestions() {
    setBusy(true); setError("");
    try {
      await jsonRequest(`/api/training/courses/${course.id}/questions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: questions.map((question, index) => ({ ...question, position: index + 1 })) }) });
      notify("تم حفظ الأسئلة"); await reload();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر حفظ الأسئلة."); }
    finally { setBusy(false); }
  }
  async function uploadVideo(file: File) {
    setBusy(true); setError("");
    try {
      const [checksum, duration] = await Promise.all([sha256(file), videoDuration(file)]);
      await jsonRequest(`/api/training/courses/${course.id}/video`, { method: "PUT", headers: { "Content-Type": "video/mp4", "X-Content-SHA256": checksum, "X-Video-Filename": file.name, "X-Video-Duration-Seconds": String(duration) }, body: file });
      notify("تم ربط الفيديو بالمسودة"); await reload();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر رفع الفيديو."); }
    finally { setBusy(false); }
  }
  async function assign() {
    if (!selectedDrivers.length) return;
    setBusy(true); setError("");
    try {
      await jsonRequest(`/api/training/courses/${course.id}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: selectedDrivers }) });
      const data = await jsonRequest<{ assignments: Assignment[] }>(`/api/training/courses/${course.id}/assignments`); setAssignments(data.assignments); setSelectedDrivers([]); notify("تم تعيين الدورة");
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "تعذر تعيين الدورة."); }
    finally { setBusy(false); }
  }
  return <div className="page-stack"><button className="back-button" onClick={back}>العودة إلى إدارة الدورات</button>
    <section className="card training-editor"><span className="status-label">{course.status === "draft" ? "مسودة" : course.status === "published" ? "منشورة" : "مؤرشفة"}</span><h1>بيانات الدورة</h1>
      <label>العنوان<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label><label>الوصف<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
      <div className="training-policy"><label>نسبة النجاح<input type="number" min="1" max="100" value={draft.passPercentage} onChange={(event) => setDraft({ ...draft, passPercentage: Number(event.target.value) })}/></label><label>فتح الاختبار بعد %<input type="number" min="0" max="100" value={draft.quizUnlockPercentage} onChange={(event) => setDraft({ ...draft, quizUnlockPercentage: Number(event.target.value) })}/></label><label>عدد المحاولات<input type="number" min="1" max="20" value={draft.maxAttempts ?? ""} placeholder="غير محدود" onChange={(event) => setDraft({ ...draft, maxAttempts: event.target.value ? Number(event.target.value) : null })}/></label></div>
      <button className="primary-button" onClick={() => void saveMetadata()} disabled={busy}>حفظ البيانات</button>{course.status !== "draft" && <button className="secondary-button" onClick={() => void saveMetadata("draft")} disabled={busy}>إعادة إلى مسودة</button>}
    </section>
    <section className="card training-editor"><h2>الفيديو والأسئلة</h2><p>{course.videoFilename ? `الفيديو: ${course.videoFilename}` : "لم يُرفع فيديو بعد."}</p><label className="file-button">رفع MP4<input type="file" accept="video/mp4,.mp4" disabled={busy || course.status !== "draft"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadVideo(file); }}/></label><label className="file-button">استيراد DOCX للمعاينة<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy || course.status !== "draft"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDocx(file); }}/></label>
      {questions.map((question, questionIndex) => <div className="training-question-editor" key={question.id ?? questionIndex}><label>السؤال {questionIndex + 1}<textarea value={question.prompt} onChange={(event) => setQuestions(questions.map((item, index) => index === questionIndex ? { ...item, prompt: event.target.value } : item))}/></label>{question.options.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={`correct-${questionIndex}`} checked={question.correctOptionIndex === optionIndex} onChange={() => setQuestions(questions.map((item, index) => index === questionIndex ? { ...item, correctOptionIndex: optionIndex } : item))}/><input value={option} onChange={(event) => setQuestions(questions.map((item, index) => index === questionIndex ? { ...item, options: item.options.map((value, position) => position === optionIndex ? event.target.value : value) } : item))}/></label>)}<label>التوضيح<textarea value={question.explanation ?? ""} onChange={(event) => setQuestions(questions.map((item, index) => index === questionIndex ? { ...item, explanation: event.target.value } : item))}/></label></div>)}
      {questions.length > 0 && <button className="primary-button" onClick={() => void saveQuestions()} disabled={busy || course.status !== "draft"}>حفظ الأسئلة ({questions.length})</button>}
    </section>
    <section className="card training-editor"><h2>المعاينة والحالة</h2><p>{readyToPublish ? "الدورة تحتوي فيديو وأسئلة، ويمكن طلب نشرها." : "أكمل الفيديو والأسئلة قبل النشر."}</p><button className="primary-button" disabled={busy || !readyToPublish || course.status === "published"} onClick={() => void saveMetadata("published")}>نشر الدورة</button><button className="secondary-button" disabled={busy || course.status === "archived"} onClick={() => void saveMetadata("archived")}>إيقاف/أرشفة</button></section>
    <section className="card training-editor"><h2>التعيين والتقدم</h2>{course.status !== "published" ? <p>التعيين متاح بعد النشر فقط.</p> : <><div className="training-driver-list">{drivers.map((driver) => <label key={driver.id}><input type="checkbox" checked={selectedDrivers.includes(driver.id)} onChange={(event) => setSelectedDrivers((values) => event.target.checked ? [...values, driver.id] : values.filter((id) => id !== driver.id))}/>{driver.displayName} ({driver.loginCode})</label>)}</div><button className="primary-button" disabled={busy || !selectedDrivers.length} onClick={() => void assign()}>تعيين للمحدد</button></>}
      {assignments.length > 0 && <div className="training-report"><div><b>السائق</b><b>المشاهدة</b><b>المحاولات</b><b>النتيجة</b></div>{assignments.map((item) => <div key={item.userId}><span>{item.displayName}</span><span>{item.videoPercentage}%</span><span>{item.attemptCount}</span><span>{item.latestScore === null ? "—" : `${item.latestScore}%`}</span></div>)}</div>}
    </section>{error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
