"use client";

import { useEffect, useMemo, useState } from "react";

type View =
  | "home"
  | "courses"
  | "course"
  | "quiz"
  | "results"
  | "trips"
  | "profile"
  | "admin";
type Theme = "light" | "dark";
type Lang = "ar" | "en";

const FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdVMrtMiyQ2F2tYlv7XHjWWExJ_Y8FWvyBN_A-0ldqkokPnDg/viewform";

const labels = {
  ar: {
    home: "الرئيسية",
    courses: "دوراتي",
    results: "النتائج",
    trips: "رحلاتي",
    profile: "حسابي",
    notifications: "الإشعارات",
    continue: "استكمل الدورة",
    start: "ابدأ الدورة",
    required: "الدورات المطلوبة",
    completed: "الدورات المكتملة",
    progress: "نسبة الإنجاز",
    lastResult: "آخر نتيجة",
  },
  en: {
    home: "Home",
    courses: "Courses",
    results: "Results",
    trips: "Trips",
    profile: "Profile",
    notifications: "Notifications",
    continue: "Continue course",
    start: "Start course",
    required: "Required courses",
    completed: "Completed courses",
    progress: "Overall progress",
    lastResult: "Last result",
  },
};

const course = {
  title: "أساسيات القيادة الآمنة وفحص المركبة قبل التحرك",
  titleEn: "Safe driving and pre-trip vehicle inspection",
  description:
    "دورة تجريبية عملية تساعد السائق على تنفيذ فحص سريع وآمن قبل بدء الرحلة والتعامل الصحيح مع المخاطر اليومية.",
  progress: 60,
  lessons: 3,
  duration: "18 دقيقة",
  deadline: "25 يوليو 2026",
  priority: "مهمة",
};

const questions = [
  {
    q: "ما أول خطوة قبل تحريك السيارة؟",
    answers: ["تشغيل التكييف", "فحص محيط السيارة", "فتح تطبيق الخرائط"],
    correct: 1,
    note: "فحص محيط السيارة يكشف العوائق والتسريب والمخاطر قبل الحركة.",
  },
  {
    q: "إذا لاحظت لمبة تحذير حمراء أثناء الفحص، ماذا تفعل؟",
    answers: ["تبدأ الرحلة", "تتجاهلها", "توقف الحركة وتبلغ المسؤول"],
    correct: 2,
    note: "التحذير الأحمر قد يشير إلى خطر مباشر ويجب الإبلاغ قبل التحرك.",
  },
  {
    q: "صح أم خطأ: إعادة مشاهدة جزء من الفيديو مسموحة في أي وقت.",
    answers: ["صح", "خطأ"],
    correct: 0,
    note: "الهدف هو الاستفادة؛ التقديم والرجوع وإعادة المشاهدة متاحة بحرية.",
  },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5M9 21v-6h6v6"/></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23.5z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5a3.5 3.5 0 0 1 3.5 3.5z"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    trip: <><path d="M3 17h18M5 17l1.5-7h11L20 17"/><circle cx="7" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/><path d="M8 10V7h6l3 3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z"/>,
    play: <path d="m9 7 8 5-8 5z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    shield: <><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Logo() {
  return <div className="logo" aria-label="MOVE X"><span>MOVE</span><b>X</b></div>;
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<"driver" | "admin">("driver");
  const [displayName, setDisplayName] = useState("محمد");
  const [view, setView] = useState<View>("home");
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = window.localStorage.getItem("movex-theme") as Theme | null;
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    const cairoHour = Number(
      new Intl.DateTimeFormat("en-GB", {hour:"2-digit", hour12:false, timeZone:"Africa/Cairo"}).format(new Date())
    );
    return cairoHour >= 18 || cairoHour < 6 ? "dark" : "light";
  });
  const [lang, setLang] = useState<Lang>("ar");
  const [loginCode, setLoginCode] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [watchProgress, setWatchProgress] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [toast, setToast] = useState("");
  const t = labels[lang];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem("movex-theme", theme);
  }, [theme, lang]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setWatchProgress((value) => Math.min(100, value + 1)), 900);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const greeting = useMemo(() => {
    const hour = Number(new Intl.DateTimeFormat("en-GB", {hour: "2-digit", hour12: false, timeZone: "Africa/Cairo"}).format(new Date()));
    if (lang === "en") return hour < 12 ? `Good morning, ${displayName}` : hour < 20 ? `Good evening, ${displayName}` : `Good night, ${displayName}`;
    return hour < 12 ? `صباح الخير يا ${displayName}` : hour < 20 ? `مساء الخير يا ${displayName}` : `ليلة سعيدة يا ${displayName}`;
  }, [lang, displayName]);

  const score = answers.reduce((sum, answer, index) => sum + (answer === questions[index]?.correct ? 1 : 0), 0);
  const scorePercent = Math.round((score / questions.length) * 100);

  async function handleLogin() {
    const normalizedCode = loginCode.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9_-]{3,24}$/.test(normalizedCode)) {
      setLoginError("أدخل كود المستخدم الصحيح، مثال: TR004");
      return;
    }
    if (!password) {
      setLoginError("أدخل كلمة السر");
      return;
    }
    setLoginLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({loginCode: normalizedCode, password}),
      });
      const data = await response.json() as {
        error?: string;
        user?: {displayName:string; role:"driver"|"supervisor"|"system_admin"; mustChangePassword:boolean};
      };
      if (!response.ok || !data.user) {
        setLoginError(data.error ?? "تعذر تسجيل الدخول");
        return;
      }
      const nextRole = data.user.role === "driver" ? "driver" : "admin";
      setDisplayName(data.user.displayName);
      setRole(nextRole);
      setView(nextRole === "admin" ? "admin" : "home");
      setMustChangePassword(data.user.mustChangePassword);
      setLoggedIn(true);
      setLoginError("");
    } catch {
      setLoginError("تعذر الاتصال بالنظام الآن. تحقق من الإنترنت وحاول مرة أخرى.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handlePreview(nextRole: "driver" | "admin") {
    setRole(nextRole);
    setView(nextRole === "admin" ? "admin" : "home");
    setDisplayName(nextRole === "driver" ? "محمد" : "المشرف");
    setLoggedIn(true);
    setMustChangePassword(false);
    setLoginError("");
  }

  async function changeTemporaryPassword() {
    setLoginError("");
    if (newPassword.length < 8) {
      setLoginError("كلمة السر الجديدة يجب ألا تقل عن 8 خانات");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setLoginError("تأكيد كلمة السر غير مطابق");
      return;
    }
    setLoginLoading(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({password:newPassword, confirmation:passwordConfirmation}),
      });
      const data = await response.json() as {error?:string};
      if (!response.ok) {
        setLoginError(data.error ?? "تعذر تغيير كلمة السر");
        return;
      }
      setMustChangePassword(false);
      setNewPassword("");
      setPasswordConfirmation("");
      setToast("تم تغيير كلمة السر بنجاح");
    } catch {
      setLoginError("تعذر الاتصال بالنظام الآن.");
    } finally {
      setLoginLoading(false);
    }
  }

  function go(next: View) {
    setView(next);
    window.scrollTo({top: 0, behavior: "smooth"});
  }

  function answerQuestion(answer: number) {
    const next = [...answers];
    next[questionIndex] = answer;
    setAnswers(next);
  }

  function nextQuestion() {
    if (answers[questionIndex] === undefined) return;
    if (questionIndex < questions.length - 1) setQuestionIndex(questionIndex + 1);
    else setQuizFinished(true);
  }

  if (!loggedIn) {
    return (
      <main className="login-shell">
        <div className="login-ambient ambient-one" />
        <div className="login-ambient ambient-two" />
        <section className="login-card">
          <div className="login-brand"><Logo/><span>تدريب وتقييم السائقين</span></div>
          <div className="login-copy">
            <span className="eyebrow">منصة MOVE X اليومية</span>
            <h1>كل تدريبك ورحلاتك<br/>في مكان واحد</h1>
            <p>واجهة سهلة من الموبايل لمتابعة الدورات، الاختبارات والنتائج، والوصول السريع لنموذج الرحلات.</p>
          </div>
          <form className="login-form" onSubmit={(e) => {e.preventDefault(); void handleLogin();}}>
            <label>كود المستخدم<input autoCapitalize="characters" autoComplete="username" placeholder="مثال: TR004" value={loginCode} onChange={(e)=>setLoginCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 24))}/></label>
            <label>كلمة السر<input type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)}/></label>
            {loginError && <p className="form-error">{loginError}</p>}
            <button className="primary-button" type="submit" disabled={loginLoading}>{loginLoading ? "جارٍ التحقق..." : "دخول إلى MOVE X"} <Icon name="arrow"/></button>
            <button className="text-button" type="button">نسيت كلمة السر؟ تواصل مع المشرف لإعادة تعيينها</button>
          </form>
          <div className="demo-actions">
            <span>للمراجعة قبل تفعيل الحسابات</span>
            <button onClick={()=>handlePreview("driver")}>معاينة كسائق</button>
            <button onClick={()=>handlePreview("admin")}>معاينة كمشرف</button>
          </div>
        </section>
        <aside className="login-side">
          <div className="road-line" />
          <div className="side-content"><Icon name="shield"/><strong>قيادة أكثر أمانًا</strong><span>تدريب واضح، متابعة دقيقة، وقرارات مبنية على البيانات.</span></div>
        </aside>
      </main>
    );
  }

  if (mustChangePassword) {
    return <main className="login-shell password-reset-shell">
      <section className="login-card password-reset-card">
        <div className="login-brand"><Logo/><span>تأمين الحساب</span></div>
        <div className="security-step"><span><Icon name="shield"/></span><div><b>أول دخول إلى حسابك</b><small>يجب تغيير كلمة السر المؤقتة قبل استخدام أي جزء من النظام.</small></div></div>
        <div className="login-copy">
          <span className="eyebrow">خطوة إلزامية لمرة واحدة</span>
          <h1>أنشئ كلمة سر خاصة بك</h1>
          <p>استخدم 8 خانات على الأقل ولا تستخدم كلمة السر المؤقتة 12345678 مرة أخرى.</p>
        </div>
        <form className="login-form" onSubmit={(event)=>{event.preventDefault();void changeTemporaryPassword();}}>
          <label>كلمة السر الجديدة<input type="password" autoComplete="new-password" value={newPassword} onChange={(event)=>setNewPassword(event.target.value)}/></label>
          <label>تأكيد كلمة السر<input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event)=>setPasswordConfirmation(event.target.value)}/></label>
          {loginError && <p className="form-error">{loginError}</p>}
          <button className="primary-button" type="submit" disabled={loginLoading}>{loginLoading ? "جارٍ الحفظ..." : "حفظ ومتابعة"}<Icon name="arrow"/></button>
        </form>
      </section>
      <aside className="login-side"><div className="road-line"/><div className="side-content"><Icon name="shield"/><strong>حسابك مسؤوليتك</strong><span>لن يستطيع المشرف رؤية كلمة السر الجديدة.</span></div></aside>
    </main>;
  }

  const navItems = role === "admin" ? [
    ["admin", "home", "لوحة المشرف"], ["courses", "book", "إدارة الدورات"], ["results", "chart", "التقارير"], ["trips", "trip", "الرحلات"], ["profile", "user", "الإعدادات"]
  ] : [
    ["home", "home", t.home], ["courses", "book", t.courses], ["trips", "trip", t.trips], ["results", "chart", t.results], ["profile", "user", t.profile]
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Logo/>
        <div className="module-name">تدريب السائقين</div>
        <nav>{navItems.map(([target, icon, label]) => <button key={target} className={view === target ? "active" : ""} onClick={()=>go(target as View)}><Icon name={icon}/><span>{label}</span></button>)}</nav>
        <div className="sidebar-footer"><span className="status-dot"/> النظام يعمل بصورة طبيعية</div>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div className="mobile-logo"><Logo/></div>
          <div className="header-title"><span>{role === "admin" ? "لوحة مشرف التدريب" : greeting}</span><small>{role === "admin" ? "نظرة شاملة على التدريب والأداء" : "خلّينا نكمل إنجازك النهارده"}</small></div>
          <div className="header-actions">
            <button className="round-button" onClick={()=>setLang(lang === "ar" ? "en" : "ar")} aria-label="تغيير اللغة">{lang === "ar" ? "EN" : "ع"}</button>
            <button className="round-button" onClick={()=>setTheme(theme === "light" ? "dark" : "light")} aria-label="تغيير الوضع"><Icon name={theme === "light" ? "moon" : "sun"}/></button>
            <button className="round-button notification-button" aria-label={t.notifications}><Icon name="bell"/><i>3</i></button>
            <button className="avatar" onClick={()=>go("profile")} aria-label="الملف الشخصي">م</button>
          </div>
        </header>

        <div className="content-area">
          {view === "home" && <DriverHome t={t} go={go} progress={watchProgress}/>} 
          {view === "courses" && <Courses go={go} progress={watchProgress}/>} 
          {view === "course" && <CourseDetail go={go} progress={watchProgress} playing={playing} setPlaying={setPlaying}/>} 
          {view === "quiz" && <Quiz go={go} questionIndex={questionIndex} setQuestionIndex={setQuestionIndex} answers={answers} answerQuestion={answerQuestion} nextQuestion={nextQuestion} finished={quizFinished} score={scorePercent}/>} 
          {view === "results" && <Results score={quizFinished ? scorePercent : 85}/>} 
          {view === "trips" && <Trips/>}
          {view === "profile" && <Profile role={role} setRole={(next)=>{setRole(next); go(next === "admin" ? "admin" : "home");}} setLoggedIn={setLoggedIn}/>} 
          {view === "admin" && <AdminDashboard go={go} setToast={setToast}/>} 
        </div>

        <nav className="bottom-nav">{navItems.map(([target, icon, label]) => <button key={target} className={view === target ? "active" : ""} onClick={()=>go(target as View)}><Icon name={icon}/><span>{label}</span></button>)}</nav>
      </section>
      {toast && <div className="toast"><Icon name="check"/>{toast}</div>}
    </main>
  );
}

function DriverHome({t, go, progress}:{t:typeof labels.ar;go:(v:View)=>void;progress:number}) {
  return <div className="page-stack">
    <section className="mobile-welcome"><span className="avatar large">م</span><div><strong>مساء الخير يا محمد</strong><small>جاهز نكمل إنجازك؟</small></div></section>
    <section className="metrics-grid">
      <Metric icon="book" label={t.required} value="3" tone="blue"/>
      <Metric icon="check" label={t.completed} value="7" tone="green"/>
      <Metric icon="chart" label={t.progress} value="70%" tone="cyan"/>
      <Metric icon="shield" label={t.lastResult} value="85%" tone="violet"/>
    </section>
    <section className="hero-course card">
      <div className="course-visual"><div className="road-art"><span className="truck">▰</span><span className="road"/><Icon name="shield"/></div><span className="priority-badge">مهمة</span></div>
      <div className="course-info"><span className="section-kicker">الدورة المطلوبة الآن</span><h1>{course.title}</h1><p>{course.description}</p><div className="progress-row"><span>التقدم</span><strong>{progress}%</strong></div><div className="progress-track"><i style={{width:`${progress}%`}}/></div><div className="course-meta"><span><Icon name="clock"/>{course.duration}</span><span>الموعد النهائي: <b>{course.deadline}</b></span></div><button className="primary-button wide" onClick={()=>go("course")}>{progress ? t.continue : t.start}<Icon name="arrow"/></button></div>
    </section>
    <section className="home-split">
      <article className="trip-card card"><div className="card-icon"><Icon name="trip"/></div><div><span className="section-kicker">نشاطك اليومي</span><h2>سجّل رحلة اليوم</h2><p>افتح نموذج MOVE X الحالي وسجّل بيانات رحلتك ومرفقاتك.</p></div><button className="secondary-button" onClick={()=>go("trips")}>فتح النموذج <Icon name="arrow"/></button></article>
      <article className="notice-card card"><div className="notice-head"><span className="card-icon"><Icon name="bell"/></span><b>آخر إشعار</b><small>منذ ساعتين</small></div><h3>دورة جديدة: فحص المركبة قبل التحرك</h3><p>تم تعيين دورة مهمة، الموعد النهائي 25 يوليو.</p><button onClick={()=>go("courses")}>عرض التفاصيل</button></article>
    </section>
  </div>;
}

function Metric({icon,label,value,tone}:{icon:string;label:string;value:string;tone:string}) {
  return <article className="metric-card card"><span className={`metric-icon ${tone}`}><Icon name={icon}/></span><div><span>{label}</span><strong>{value}</strong></div></article>;
}

function Courses({go,progress}:{go:(v:View)=>void;progress:number}) {
  return <div className="page-stack"><PageHead title="دوراتي" subtitle="تابع الدورات المطلوبة والمكتملة في مكان واحد"/>
    <div className="filter-row"><button className="active">الكل <b>10</b></button><button>جاري التنفيذ <b>1</b></button><button>لم تبدأ <b>2</b></button><button>مكتملة <b>7</b></button></div>
    <div className="course-list">
      <CourseCard title={course.title} status="جاري التنفيذ" progress={progress} priority="مهمة" go={go}/>
      <CourseCard title="القيادة الاقتصادية وتقليل استهلاك الوقود" status="لم تبدأ" progress={0} priority="عادية" go={go}/>
      <CourseCard title="التصرف الصحيح عند الحوادث والطوارئ" status="لم تبدأ" progress={0} priority="عاجلة" go={go}/>
      <CourseCard title="التعامل الآمن مع العملاء" status="مكتملة" progress={100} priority="عادية" go={go}/>
    </div>
  </div>;
}

function CourseCard({title,status,progress,priority,go}:{title:string;status:string;progress:number;priority:string;go:(v:View)=>void}) {
  return <article className="course-card card"><div className="mini-cover"><Icon name={progress===100?"check":"shield"}/><span className={`priority ${priority === "عاجلة" ? "urgent" : priority === "مهمة" ? "important" : "normal"}`}>{priority}</span></div><div className="course-card-body"><span className="status-label">{status}</span><h2>{title}</h2><div className="mini-meta"><span><Icon name="clock"/>18 دقيقة</span><span>3 دروس</span></div><div className="progress-track"><i style={{width:`${progress}%`}}/></div><div className="card-bottom"><span>{progress}% مكتمل</span><button onClick={()=>go("course")}>{progress===100?"مراجعة":"فتح الدورة"}<Icon name="arrow"/></button></div></div></article>;
}

function CourseDetail({go,progress,playing,setPlaying}:{go:(v:View)=>void;progress:number;playing:boolean;setPlaying:(v:boolean)=>void}) {
  return <div className="page-stack"><button className="back-button" onClick={()=>go("courses")}><Icon name="arrow"/>العودة إلى الدورات</button>
    <section className="lesson-layout"><div className="video-panel card"><div className={`video-stage ${playing?"playing":""}`}><div className="video-road"><Icon name="shield"/><span>فحص المركبة قبل التحرك</span></div><button className="play-button" onClick={()=>setPlaying(!playing)}><Icon name={playing?"check":"play"}/></button><div className="video-progress"><i style={{width:`${progress}%`}}/></div></div><div className="video-details"><span className="section-kicker">الدرس 1 من 3</span><h1>فحص المركبة قبل التحرك</h1><p>راجع الإطارات، السوائل، الإضاءة ومحيط السيارة قبل بداية كل رحلة.</p><div className="source-pills"><button>YouTube</button><button>TikTok</button><button>Instagram</button><button>Google Drive</button></div></div></div>
      <aside className="lesson-side card"><h2>محتويات الدورة</h2><button className="lesson active"><span>1</span><div><b>فحص ما قبل الرحلة</b><small>{progress}% مشاهدة</small></div><Icon name="check"/></button><button className="lesson"><span>2</span><div><b>القيادة الآمنة</b><small>8 دقائق</small></div></button><button className="lesson"><span>3</span><div><b>التعامل مع الطوارئ</b><small>5 دقائق</small></div></button><div className="unlock-note"><Icon name="shield"/><span>الاختبار يفتح عند مشاهدة 80% من المحتوى.</span></div><button className="primary-button wide" disabled={progress<80} onClick={()=>go("quiz")}>{progress<80?`شاهد ${80-progress}% إضافية لفتح الاختبار`:"ابدأ الاختبار"}</button></aside>
    </section>
  </div>;
}

function Quiz({go,questionIndex,setQuestionIndex,answers,answerQuestion,nextQuestion,finished,score}:{go:(v:View)=>void;questionIndex:number;setQuestionIndex:(v:number)=>void;answers:number[];answerQuestion:(v:number)=>void;nextQuestion:()=>void;finished:boolean;score:number}) {
  if (finished) return <div className="result-celebration card"><span className={`score-ring ${score>=80?"pass":"fail"}`}>{score}%</span><span className="section-kicker">نتيجة المحاولة</span><h1>{score>=80?"أحسنت، اجتزت الدورة":"المحاولة تحتاج مراجعة"}</h1><p>أجبت بشكل صحيح على {Math.round(score*questions.length/100)} من {questions.length} أسئلة.</p><div className="review-list">{questions.map((q,i)=><div key={q.q} className={answers[i]===q.correct?"correct":"wrong"}><Icon name={answers[i]===q.correct?"check":"shield"}/><div><b>{q.q}</b><span>الإجابة الصحيحة: {q.answers[q.correct]}</span><small>{q.note}</small></div></div>)}</div><button className="primary-button" onClick={()=>go("results")}>عرض سجل النتائج</button></div>;
  const q = questions[questionIndex];
  return <div className="quiz-shell card"><div className="quiz-head"><div><span className="section-kicker">اختبار الدورة التجريبية</span><h1>السؤال {questionIndex+1} من {questions.length}</h1></div><span className="timer"><Icon name="clock"/>14:32</span></div><div className="question-progress"><i style={{width:`${((questionIndex+1)/questions.length)*100}%`}}/></div><h2>{q.q}</h2><div className="answers">{q.answers.map((answer,i)=><button key={answer} className={answers[questionIndex]===i?"selected":""} onClick={()=>answerQuestion(i)}><span>{String.fromCharCode(65+i)}</span>{answer}<Icon name="check"/></button>)}</div><div className="quiz-actions"><button className="secondary-button" disabled={questionIndex===0} onClick={()=>setQuestionIndex(questionIndex-1)}>السابق</button><button className="primary-button" disabled={answers[questionIndex]===undefined} onClick={nextQuestion}>{questionIndex===questions.length-1?"تسليم الاختبار":"السؤال التالي"}<Icon name="arrow"/></button></div></div>;
}

function Results({score}:{score:number}) {
  return <div className="page-stack"><PageHead title="نتائجي" subtitle="سجل الدورات والاختبارات والمحاولات السابقة"/><section className="result-summary"><Metric icon="shield" label="متوسط الدرجات" value={`${score}%`} tone="green"/><Metric icon="check" label="ناجح من أول محاولة" value="6" tone="blue"/><Metric icon="book" label="دورات مكتملة" value="7" tone="cyan"/></section><section className="results-table card"><div className="table-row table-head"><span>الدورة</span><span>التاريخ</span><span>الدرجة</span><span>المحاولات</span><span>الحالة</span></div>{[[course.title,"21 يوليو 2026",`${score}%`,"1","ناجح"],["التعامل الآمن مع العملاء","11 يوليو 2026","90%","1","ناجح"],["القيادة الاقتصادية","2 يوليو 2026","75%","2","ناجح"]].map(row=><div className="table-row" key={row[0]}>{row.map((cell,i)=><span key={i} className={i===4?"success-pill":""}>{cell}</span>)}</div>)}</section></div>;
}

function Trips() {
  const [showForm,setShowForm] = useState(false);
  return <div className="page-stack"><PageHead title="رحلاتي" subtitle="الوصول السريع إلى نموذج النشاط اليومي الحالي"/><section className="trip-access card"><div className="trip-access-copy"><span className="trip-big-icon"><Icon name="trip"/></span><div><span className="section-kicker">Google Form المعتمد</span><h1>تسجيل رحلة اليوم</h1><p>سيظل النموذج الحالي مسؤولًا عن إرسال بياناتك ومرفقاتك إلى Daily Activity Log دون أي تغيير.</p></div></div><div className="trip-actions"><button className="primary-button" onClick={()=>setShowForm(!showForm)}>{showForm?"إخفاء النموذج":"فتح داخل MOVE X"}<Icon name="arrow"/></button><a className="secondary-button" href={FORM_URL} target="_blank" rel="noreferrer">فتح النموذج مباشرة</a></div></section>{showForm&&<section className="form-frame card"><div className="frame-head"><span className="status-dot"/> النموذج الحالي — MOVE X<a href={FORM_URL} target="_blank" rel="noreferrer">فتح في نافذة جديدة</a></div><iframe title="نموذج تسجيل رحلات MOVE X" src={`${FORM_URL}?embedded=true`}>جار تحميل النموذج…</iframe></section>}<section className="info-strip"><Icon name="shield"/><div><b>بياناتك مستمرة في نفس المسار</b><span>الإرسال يتم من Google Form الحالي إلى تبويب Daily Activity Log كما هو الآن.</span></div></section></div>;
}

function Profile({role,setRole,setLoggedIn}:{role:"driver"|"admin";setRole:(v:"driver"|"admin")=>void;setLoggedIn:(v:boolean)=>void}) {
  async function logout() {
    try { await fetch("/api/auth/logout", {method:"POST"}); } finally { setLoggedIn(false); }
  }
  return <div className="page-stack"><PageHead title="حسابي" subtitle="بيانات الحساب والهوية الموثقة"/><section className="profile-grid"><article className="profile-card card"><div className="profile-photo">م<button><Icon name="upload"/></button></div><h2>محمد سعد</h2><span>سائق — MOVE X</span><button className="secondary-button">طلب تغيير الصورة</button><div className="face-status"><span className="face-status-icon"><Icon name="shield"/></span><div><b>التحقق من الوجه</b><small>غير مسجل — سيُفعّل بعد اعتماد الصورة المرجعية وموافقة السائق.</small></div><em>قيد التجهيز</em></div></article><article className="settings-card card"><h2>بيانات الحساب</h2><label>كود المستخدم<input value="TR004" readOnly/></label><label>البريد الإلكتروني<input value="driver@example.com" readOnly/></label><label>اللغة المفضلة<select defaultValue="ar"><option value="ar">العربية</option><option value="en">English</option></select></label><div className="identity-policy"><Icon name="shield"/><div><b>هوية واحدة لكل خدمات MOVE X</b><small>سيُستخدم التحقق الموثق مستقبلًا في الرحلات والحوادث والاختبارات والإجراءات الحساسة.</small></div></div><div className="role-preview"><span>وضع المعاينة الحالي: <b>{role==="admin"?"مشرف":"سائق"}</b></span><button onClick={()=>setRole(role==="admin"?"driver":"admin")}>التبديل للمعاينة</button></div><button className="danger-button" onClick={()=>void logout()}>تسجيل الخروج</button></article></section></div>;
}

function AdminDashboard({go,setToast}:{go:(v:View)=>void;setToast:(v:string)=>void}) {
  return <div className="page-stack"><div className="page-head admin-head"><div><span className="section-kicker">نظرة عامة — يوليو 2026</span><h1>لوحة مشرف التدريب</h1><p>تابع الإنجاز والنتائج والسائقين الذين يحتاجون تدخلك.</p></div><button className="primary-button" onClick={()=>setToast("تم إنشاء مسودة دورة جديدة")}>+ إنشاء دورة</button></div><section className="metrics-grid admin-metrics"><Metric icon="user" label="إجمالي السائقين" value="30" tone="blue"/><Metric icon="chart" label="الإنجاز العام" value="72%" tone="cyan"/><Metric icon="check" label="نسبة النجاح" value="84%" tone="green"/><Metric icon="bell" label="يحتاجون متابعة" value="5" tone="violet"/></section><section className="admin-grid"><article className="performance-card card"><div className="card-title"><div><span className="section-kicker">الأداء العام</span><h2>تقدم التدريب هذا الشهر</h2></div><select><option>يوليو 2026</option></select></div><div className="bar-chart">{[44,58,52,68,72,81,76,86].map((h,i)=><div key={i}><i style={{height:`${h}%`}}/><span>{i+1}</span></div>)}</div><div className="chart-legend"><span><i className="blue-dot"/>نسبة الإنجاز</span><b>+14% عن الشهر السابق</b></div></article><article className="attention-card card"><div className="card-title"><div><span className="section-kicker">إجراء مطلوب</span><h2>سائقون يحتاجون متابعة</h2></div><button onClick={()=>go("results")}>عرض الكل</button></div>{[["أحمد سيد","استنفد المحاولات","عاجل"],["محمد حامد","متأخر عن الموعد","مهم"],["هاني محمود","لم يبدأ الدورة","متابعة"]].map(([name,reason,status],i)=><div className="driver-alert" key={name}><span className="avatar small">{name[0]}</span><div><b>{name}</b><small>{reason}</small></div><span className={`alert-status s${i}`}>{status}</span><button onClick={()=>setToast(`تم فتح ملف ${name}`)}><Icon name="arrow"/></button></div>)}</article></section><section className="admin-grid lower"><article className="course-status card"><div className="card-title"><div><span className="section-kicker">الدورات النشطة</span><h2>حالة التنفيذ</h2></div><button onClick={()=>go("courses")}>إدارة الدورات</button></div>{[[course.title,"24/30","80%"],["القيادة الاقتصادية","18/30","60%"],["الطوارئ والحوادث","11/30","37%"]].map(([title,people,percent])=><div className="course-progress-row" key={title}><div><b>{title}</b><span>{people} سائق</span></div><div className="progress-track"><i style={{width:percent}}/></div><strong>{percent}</strong></div>)}</article><article className="quick-actions card"><span className="section-kicker">إجراءات سريعة</span><h2>إدارة التدريب</h2><div><button onClick={()=>setToast("تم فتح استيراد Excel")}><Icon name="upload"/><span><b>استيراد السائقين</b><small>من الشيت أو Excel</small></span></button><button onClick={()=>setToast("تم فتح بنك الأسئلة")}><Icon name="book"/><span><b>بنك الأسئلة</b><small>إضافة وتصنيف الأسئلة</small></span></button><button onClick={()=>go("results")}><Icon name="chart"/><span><b>استخراج تقرير</b><small>Excel أو PDF</small></span></button></div></article></section></div>;
}

function PageHead({title,subtitle}:{title:string;subtitle:string}) {return <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div></div>}
