import { getD1 } from "@/db";
import { OperationalStore } from "@/db/operational-store";
import { OperationalShell, PageTitle } from "@/components/operational-shell";
import { requirePageRole } from "@/lib/operational/server-auth";

const shifts:Record<string,string>={morning:"صباحية",evening:"مسائية",night:"ليلية",flexible:"مرنة"};
const states:Record<string,string>={active:"نشط",vacation:"إجازة",suspended:"موقوف",resigned:"مستقيل",terminated:"منتهي الخدمة",valid:"سارية",expiring:"قاربت الانتهاء",expired:"منتهية",pending:"قيد المراجعة",rejected:"مرفوضة",not_provided:"غير مقدمة",negative:"سلبي",positive:"إيجابي"};

export default async function DriverPage(){
  const c=await requirePageRole(["driver"]);
  const store=new OperationalStore(await getD1());
  const[overview,settings,profile]=await Promise.all([store.driverOverview(c.user.id),store.settings(),store.getDriverProfile(c.user.id)]);
  const documents=profile?await store.listDriverDocuments(Number(profile.driver_profile_id)):[];
  const showTrips=settings.show_trips_button==="true"&&Boolean(settings.trips_form_url);
  return <OperationalShell role={c.user.role} name={c.user.displayName}>
    <PageTitle title={`مرحبًا، ${c.user.displayName}`} subtitle={`كود السائق: ${c.user.loginCode} — الحالة: نشط`}/>
    {profile&&<section className="op-panel"><h2>ملفي الشخصي وحالة المستندات</h2><div className="detail-grid"><div className="detail-item"><small>الهاتف</small><strong>{String(profile.phone)}</strong></div><div className="detail-item"><small>الوردية</small><strong>{shifts[String(profile.primary_shift)]??String(profile.primary_shift)}</strong></div><div className="detail-item"><small>الحالة الوظيفية</small><strong>{states[String(profile.employment_status)]??String(profile.employment_status)}</strong></div><div className="detail-item"><small>الرخصة</small><strong>{states[String(profile.driving_license_status)]??String(profile.driving_license_status)} — {String(profile.driving_license_expiry??"—")}</strong></div><div className="detail-item"><small>صحيفة الحالة الجنائية</small><strong>{states[String(profile.criminal_record_status)]??String(profile.criminal_record_status)} — {String(profile.criminal_record_expiry??"—")}</strong></div><div className="detail-item"><small>تحليل المخدرات</small><strong>{states[String(profile.drug_test_status)]??String(profile.drug_test_status)} — {String(profile.drug_test_expiry??"—")}</strong></div><div className="detail-item"><small>المستندات النشطة</small><strong>{documents.filter(document=>!document.archived_at).length}</strong></div></div><p className="op-muted">البيانات المعتمدة للعرض فقط في النسخة الحالية. تواصل مع مدير النظام لطلب تعديل.</p></section>}
    <section className="op-panel"><h2>السيارات المصرح لك بقيادتها</h2>{overview.assignments.length?<div className="op-table-wrap"><table><thead><tr><th>السيارة</th><th>اللوحة</th><th>الوردية</th><th>الحيازة</th><th>السائق الحالي</th></tr></thead><tbody>{overview.assignments.map((assignment,index)=><tr key={String(assignment.id??index)}><td>{String(assignment.internal_code)} — {String(assignment.make)} {String(assignment.model)}</td><td>{String(assignment.plate_number)}</td><td>{shifts[String(assignment.shift_type)]??String(assignment.shift_type)}</td><td>{assignment.has_custody?"في حيازتك الآن":"ليست في حيازتك"}</td><td>{assignment.current_driver_name?String(assignment.current_driver_name):"لا أحد"}</td></tr>)}</tbody></table></div>:<p>لا توجد سيارة مصرح لك بقيادتها حاليًا.</p>}</section>
    <section className="op-panel"><h2>آخر عمليات الاستلام والتسليم</h2>{overview.handovers.length?<div className="op-table-wrap"><table><thead><tr><th>السيارة</th><th>العملية</th><th>الطرف الآخر</th><th>الوقت</th></tr></thead><tbody>{overview.handovers.map((handover,index)=><tr key={String(handover.id??index)}><td>{String(handover.internal_code)}</td><td>{handover.direction==="received"?"استلمت":"سلّمت"}</td><td>{handover.direction==="received"?(handover.from_driver_name?String(handover.from_driver_name):"بداية التشغيل"):String(handover.to_driver_name)}</td><td>{String(handover.received_at)}</td></tr>)}</tbody></table></div>:<p>لا توجد عمليات تسليم مسجلة.</p>}</section>
    <section className="op-panel"><h2>الدورات المخصصة</h2><p>لا توجد بيانات دورات في Operational Core. سيتم ربطها لاحقًا.</p></section>
    <section className="op-panel"><h2>الرحلات اليومية</h2>{showTrips?<a className="op-primary" href={settings.trips_form_url} target="_blank" rel="noreferrer">فتح نموذج الرحلات</a>:<p>رابط الرحلات غير مضبوط حاليًا.</p>}</section>
  </OperationalShell>;
}
