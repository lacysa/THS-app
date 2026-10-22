'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { CheckCircle2,RefreshCw } from 'lucide-react'
type Task={key:string;group:string;label:string;time:string;assignedTo:string|null;assignedName:string;completedAt:string|null;notes:string}
type Staff={id:string;name:string;role:string}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const labels:Record<string,string>={runner:'Breakfast / Runner',laundry:'Laundry',housekeeping:'Lobby / Hotel',hospitality:'Hospitality Assistant · Guest Areas'}
const groups=['runner','laundry','housekeeping','hospitality']
export default function SideworkBoard({compact=false}:{compact?:boolean}){
 const [date,setDate]=useState(today),[items,setItems]=useState<Task[]>([]),[staff,setStaff]=useState<Staff[]>([])
 const [manager,setManager]=useState(false),[preview,setPreview]=useState(false),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('')
 const load=useCallback(async()=>{setLoading(true);setError('')
  try{const r=await fetch('/api/housekeeping/sidework?date='+encodeURIComponent(date),{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load sidework');setItems(d.items||[]);setStaff(d.staff||[]);setManager(!!d.manager);setPreview(!!d.preview)}
  catch(e:any){setError(e.message||'Unable to load sidework')}finally{setLoading(false)}
 },[date])
 useEffect(()=>{void load()},[load])
 const completed=useMemo(()=>items.filter(t=>t.completedAt).length,[items])
 async function change(task:Task,action:'assign'|'complete'|'note',value:string|boolean|null){
  setBusy(task.key);setError('');setMessage('')
  const body:any={date,taskKey:task.key,action}
  if(action==='assign')body.assignedTo=value
  if(action==='complete')body.completed=value
  if(action==='note')body.note=value
  try{const r=await fetch('/api/housekeeping/sidework',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to save sidework');setMessage('Sidework updated');await load()}
  catch(e:any){setError(e.message||'Unable to save')}finally{setBusy('')}
 }
 return <section className={'ths-sidework '+(compact?'compact':'')}>
  {!compact&&<header className="ths-sidework-hero"><div><small>THE HOTEL SAUGATUCK · HOUSEKEEPING</small><h1>Today's Sidework</h1><p>Daily tasks assigned from scheduled roles. Let management know about anything you cannot finish.</p></div><div className="ths-sidework-tools"><input aria-label="Sidework date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><button type="button" onClick={()=>void load()} aria-label="Refresh sidework"><RefreshCw size={17}/></button></div></header>}
  {!compact&&<div className="ths-sidework-total"><strong>{completed} / {items.length}</strong> completed</div>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="ths-sidework-error">{error}</p>}
  {loading?<p>Loading sidework…</p>:items.length===0?<div className="ths-sidework-empty">No sidework assigned to you for this date.</div>:<div className="ths-sidework-groups">
  {groups.filter(g=>items.some(t=>t.group===g)).map(g=><div className="ths-sidework-group" key={g}>
   <div className="ths-sidework-title"><strong>{labels[g]}</strong><span>{items.filter(t=>t.group===g&&t.completedAt).length} / {items.filter(t=>t.group===g).length} done</span></div>
   {items.filter(t=>t.group===g).map(t=><article key={t.key} className={'ths-sidework-task '+(t.completedAt?'done':'')}>
    <label className="ths-sidework-check"><input type="checkbox" checked={!!t.completedAt} disabled={preview||busy===t.key||!t.assignedTo} onChange={e=>void change(t,'complete',e.target.checked)}/><span><strong>{t.label}</strong>{t.time&&<small>{t.time}</small>}</span></label>
    {manager?<select aria-label={'Assign '+t.label} value={t.assignedTo||''} disabled={preview||busy===t.key} onChange={e=>void change(t,'assign',e.target.value||null)}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>:null}
    {!manager&&t.assignedName&&<small className="ths-sidework-person">{t.assignedName}</small>}
    <input aria-label={'Notes for '+t.label} placeholder="Notes (optional)" defaultValue={t.notes} key={t.key+':'+t.notes} disabled={preview||busy===t.key||!t.assignedTo} onBlur={e=>{if(e.target.value!==t.notes)void change(t,'note',e.target.value)}}/>
   </article>)}
  </div>)}</div>}
  <style jsx>{`
   .ths-sidework{max-width:1100px;margin:auto;padding:20px 18px 70px;color:#263b47}.ths-sidework.compact{padding:0}.ths-sidework-hero{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;align-items:center;border-radius:20px;padding:24px;background:linear-gradient(120deg,#e1f3ef,#edf3fc,#eae4fb)}.ths-sidework-hero small{font-size:11px;letter-spacing:.12em;font-weight:750;color:#6d8292}.ths-sidework-hero h1{font-size:clamp(24px,4vw,34px);margin:6px 0}.ths-sidework-hero p{color:#627987;margin:0}.ths-sidework-tools{display:flex;gap:8px}.ths-sidework-tools>*{padding:11px;border-radius:11px;border:1px solid #d4e1e8;background:white;color:#263b47}.ths-sidework-total{padding:18px 2px}.ths-sidework-total strong{font-size:24px}.ths-sidework-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,370px),1fr));gap:16px}.ths-sidework-group{background:#fff;border:1px solid #dfe7eb;border-radius:18px;padding:16px}.ths-sidework-title{padding:8px 5px 15px;display:flex;justify-content:space-between;gap:10px}.ths-sidework-title span{color:#618275;font-size:12px}.ths-sidework-task{padding:13px 10px;border-top:1px solid #e7ebef;display:flex;flex-direction:column;gap:9px}.ths-sidework-task.done{background:#e8f5ed;border-radius:10px}.ths-sidework-check{display:flex;align-items:flex-start;gap:11px;cursor:pointer}.ths-sidework-check input{height:20px;width:20px;accent-color:#37806c;flex-shrink:0}.ths-sidework-check span{display:flex;flex-direction:column;gap:5px}.ths-sidework-check strong{font-size:14px;font-weight:650}.ths-sidework-check small,.ths-sidework-person{font-size:12px;color:#69818a}.ths-sidework-task select,.ths-sidework-task>input{border:1px solid #d9e4e9;border-radius:10px;padding:10px;background:#fbfcfd;width:100%;min-height:40px;color:#314757}.ths-sidework-error{color:#9f2440}.ths-sidework-empty{padding:25px;background:#f0f5fa;border-radius:15px}
   @media(max-width:600px){.ths-sidework{padding:12px 10px 50px}.ths-sidework-hero{padding:17px}.ths-sidework-groups{grid-template-columns:1fr}.ths-sidework-group{padding:12px}}
  `}</style>
 </section>
}
