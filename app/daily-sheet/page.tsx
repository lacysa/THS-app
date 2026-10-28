// @ts-nocheck
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'
import { ymdInHotelTz } from '@/lib/time'
import DailySheetPrintButton from '@/components/DailySheetPrintButton'

export const dynamic='force-dynamic'
function plusDay(value:string){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function readable(v:string){return new Date(v+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'})}
export default async function DailySheet({searchParams}:{searchParams:Promise<{date?:string}>}){
 const access=await getStaffAccess()
 if(!access)redirect('/login')
 const p=await searchParams
 const today=ymdInHotelTz()
 const date=/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')?p.date!:today
 const tomorrow=plusDay(date)
 const db=createSupabaseAdmin()
 const [roomsQ,dayQ,linksQ,staysQ,packagesQ,catalogQ,notesQ,menusQ,tagsQ]=await Promise.all([
  db.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
  db.from('housekeeping_daily_rooms').select('room_id,reservation_status,service_type,notes,room_condition,late_arrival,breakfast_tag,breakfast_skipped,assigned_to').eq('service_date',date),
  db.from('reservation_daily_links').select('*').eq('service_date',date),
  db.from('reservation_stays').select('id,room_id,guest_name,arrival_date,checkout_date,innkeeper_notes,guest_comments,dietary_restrictions,rate_plan').eq('active',true).lte('arrival_date',date).gt('checkout_date',date),
  db.from('housekeeping_room_packages').select('room_id,package_id').eq('service_date',date),
  db.from('room_package_catalog').select('id,name'),
  db.from('room_notes').select('room_id,note,note_type,resolved,service_date').or('service_date.eq.'+date+',note_type.eq.persistent'),
  db.from('breakfast_bookings').select('room_id,status,menu_submitted').eq('service_date',tomorrow).in('status',['scheduled','declined']),
  db.from('housekeeping_daily_rooms').select('room_id,breakfast_tag,breakfast_skipped').eq('service_date',date).eq('breakfast_tag',true)
 ])
 const rooms=roomsQ.data||[],day=dayQ.data||[],links=linksQ.data||[],stays=staysQ.data||[]
 const byRoom=new Map(day.map((x:any)=>[x.room_id,x]))
 const linkByRoom=new Map(links.map((x:any)=>[x.room_id,x]))
 const stayById=new Map(stays.map((x:any)=>[x.id,x]))
 const stayByRoom=new Map(stays.map((x:any)=>[x.room_id,x]))
 const catalog=new Map((catalogQ.data||[]).map((x:any)=>[x.id,x.name]))
 const pkgByRoom=new Map<string,string[]>()
 for(const p of packagesQ.data||[]){const arr=pkgByRoom.get(p.room_id)||[];const name=catalog.get(p.package_id);if(name)arr.push(name);pkgByRoom.set(p.room_id,arr)}
 const notesByRoom=new Map<string,string[]>()
 for(const n of notesQ.data||[]){if(n.note_type==='persistent'&&n.resolved)continue;const arr=notesByRoom.get(n.room_id)||[];if(n.note)arr.push(n.note);notesByRoom.set(n.room_id,arr)}
 const bookings=menusQ.data||[]
 const booked=new Set(bookings.map(x=>x.room_id))
 const breakfastIds=new Set(bookings.filter(x=>x.status==='scheduled').map(x=>x.room_id))
 for(const r of tagsQ.data||[]){if(!booked.has(r.room_id)&&!r.breakfast_skipped)breakfastIds.add(r.room_id)}
 const record=rooms.map((room:any)=>{
  const d:any=byRoom.get(room.id)||{}
  const link:any=linkByRoom.get(room.id)||{}
  const stay:any=stayByRoom.get(room.id)||{}
  const status=String(d.reservation_status||link.reservation_status||'Vacant')
  const service=String(d.service_type||'')
  const arrival=status==='Arrival'||status==='Out/In'
  const inRoomNotes=[String(d.notes||''),String(stay.innkeeper_notes||''),String(stay.guest_comments||''),...(notesByRoom.get(room.id)||[])].map(x=>x.trim()).filter(Boolean)
  return {name:room.name,status,service,arrival,stayover:status==='Stayover',packages:pkgByRoom.get(room.id)||[],notes:[...new Set(inRoomNotes)],dessert:breakfastIds.has(room.id),lateArrival:Boolean(d.late_arrival)}
 })
 const count=(fn:(r:typeof record[number])=>boolean)=>record.filter(fn).length
 const metrics=[
  {label:'Desserts tonight',value:breakfastIds.size},
  {label:'Stayovers',value:count(x=>x.stayover)},
  {label:'Arrivals incl. Out/In',value:count(x=>x.arrival)},
  {label:'Packages',value:count(x=>x.packages.length>0)}
 ]
 const sheetData={isoDate:date,dateLabel:readable(date),metrics,rows:record}
 return <main className="sheet-wrap">
 <style>{`
 body{background:#eaf1f6}.sheet-wrap{font-family:Arial,sans-serif;max-width:850px;margin:24px auto;background:white;color:#15242f;padding:35px;box-shadow:0 10px 35px #cbd5df}
 .sheet-controls{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px;gap:12px;flex-wrap:wrap}.sheet-controls a{color:#284b65;text-decoration:none}.sheet-controls button{background:#152b3a;color:white;border:0;border-radius:9px;padding:12px 18px;cursor:pointer}.sheet-print-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sheet-print-actions button:disabled{opacity:.6;cursor:wait}.sheet-print-error{width:100%;color:#a12727}.sheet-controls form{display:flex;gap:5px;flex-wrap:wrap}
 .sheet-head{border-bottom:2px solid #a5d4df;padding-bottom:12px}.sheet-kicker{letter-spacing:2px;text-transform:uppercase;font-size:10px;color:#607886;font-weight:700}h1{font-size:27px;margin:8px 0 3px}h2{font-size:15px;margin:24px 0 9px}.sheet-date{color:#607886;font-size:13px}
 .sheet-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:18px 0}.sheet-metric{border:1px solid #d5e1e8;border-radius:10px;padding:11px}.sheet-metric span{display:block;font-size:11px;color:#4d6779}.sheet-metric strong{display:block;font-size:25px;margin-top:4px}
 table{width:100%;border-collapse:collapse;font-size:11px}th{text-transform:uppercase;letter-spacing:.6px;font-size:10px;text-align:left;background:#eff6f9}td,th{padding:9px 7px;border-bottom:1px solid #dde7eb;vertical-align:top}td:first-child{font-weight:bold;width:21%}td:last-child{width:7%;text-align:center}.room-tag{display:inline-block;background:#eaf1f6;border-radius:5px;padding:2px 5px;margin:0 4px 4px 0}.room-notes{margin-top:7px;border-left:3px solid #b0ccd7;padding-left:9px;min-width:0}.room-note{margin-top:5px;color:#425666;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;line-height:1.4}.room-note-label{display:inline-block;margin-right:6px;color:#41697b;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.04em}.room-note-details summary{cursor:pointer;color:#416b7d;font-weight:700;font-size:11px;margin:6px 0}.room-note-details[open]{background:#f6fafb;padding:7px 9px;border-radius:8px}.sheet-room-activity{min-width:0}.sheet-wrap td{overflow-wrap:anywhere}.sheet-wrap tbody tr:nth-child(even){background:#f6fafc}.sheet-wrap tbody td:first-child{color:#234b61}.sheet-wrap .room-tag{font-weight:650;color:#325c71;background:#e7f2f6}.sheet-check{font-size:19px;color:#94a4ac}.sheet-foot{margin-top:15px;font-size:10px;color:#657986}
 @media print{@page{size:letter portrait;margin:.38in}html,body{background:white!important}.sheet-wrap{margin:0;max-width:none;padding:0;box-shadow:none}.sheet-controls{display:none}.sheet-metrics{gap:7px;margin:12px 0}.sheet-metric{padding:8px}h1{font-size:22px}h2{margin:15px 0 7px}tr{break-inside:avoid}td,th{padding:6px 5px}.room-note-details{display:block!important}.room-note-details summary{display:none!important}.room-note-details:not([open])>*:not(summary){display:block!important}.sheet-wrap{print-color-adjust:exact;-webkit-print-color-adjust:exact}.sheet-wrap tbody tr:nth-child(even){background:#f6fafc!important}.room-notes{border-left-color:#94bac8!important}.sheet-note{font-size:10px}}
 `}</style>
 <div className="sheet-controls"><Link href="/dashboard">← Dashboard</Link><form><label>Sheet date <input type="date" name="date" defaultValue={date}/></label><button type="submit">Load date</button></form><DailySheetPrintButton sheet={sheetData}/></div>
 <header className="sheet-head"><div className="sheet-kicker">The Hotel Saugatuck · Operations</div><h1>Daily Operations Sheet</h1><div className="sheet-date">{readable(date)}</div></header>
 <div className="sheet-metrics">
 {metrics.map(x=><div className="sheet-metric" key={x.label}><span>{x.label}</span><strong>{x.value}</strong></div>)}
 </div>
 <h2>Room-by-room activity · All {record.length} rooms</h2>
 <table><thead><tr><th>Room</th><th>Activity, services &amp; notes</th><th>Done</th></tr></thead><tbody>
 {record.map(r=><tr key={r.name}><td>{r.name}</td><td className="sheet-room-activity">
 <span className="room-tag">{r.status}</span>
 {r.service&&<span className="room-tag">{r.service}</span>}
 {r.dessert&&<span className="room-tag">Dessert</span>}
 {r.lateArrival&&<span className="room-tag">Late arrival</span>}
 {r.packages.map((x,i)=><span className="room-tag" key={i}>Package: {x}</span>)}
 {r.notes.length>0&&<div className="room-notes">{r.notes.map((n,i)=>n.length>300?<details key={i} className="room-note-details"><summary>Guest note {i+1} · {n.length} characters (expand)</summary><div className="room-note"><span className="room-note-label">Note</span>{n}</div></details>:<div key={i} className="room-note"><span className="room-note-label">Note</span>{n}</div>)}</div>}
 </td><td><span className="sheet-check">□</span></td></tr>)}
 </tbody></table>
 <div className="sheet-foot">Operational snapshot generated from live THS records. Check boxes are for paper use only and do not change room status.</div>
 </main>
}