'use client'
import {useEffect,useMemo,useState} from 'react'
import {RefreshCw,Search,ShieldCheck,Clock3} from 'lucide-react'

type Staff={userId:string;name:string;fullName:string;email:string;role:string;lastSignedInAt:string|null}
type Login={id:string;userId:string;name:string;at:string}
type Report={staff:Staff[];logins:Login[];historyLimit:number}
type Range='7'|'30'|'90'|'all'

function displayTime(value:string|null){
 if(!value)return 'Never signed in'
 const date=new Date(value)
 if(Number.isNaN(date.getTime()))return 'Unknown'
 return new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Detroit',month:'short',day:'numeric',year:'numeric',
  hour:'numeric',minute:'2-digit',timeZoneName:'short'
 }).format(date)
}
function relativeDay(value:string){
 const today=new Date()
 const date=new Date(value)
 const day=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',month:'short',day:'numeric'}).format(date)
 const current=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',month:'short',day:'numeric'}).format(today)
 return current===day?'Today':day
}

export default function StaffLoginActivity(){
 const [report,setReport]=useState<Report|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [search,setSearch]=useState('')
 const [staffFilter,setStaffFilter]=useState('')
 const [range,setRange]=useState<Range>('30')

 async function load(){
  setLoading(true);setError('')
  try{
   const response=await fetch('/api/admin/staff-logins',{cache:'no-store'})
   const result=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(result.error||'Could not load staff logins')
   setReport(result as Report)
  }catch(e:any){setError(e?.message||'Could not load staff logins')}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load()},[])

 const staff=report?.staff||[]
 const logins=report?.logins||[]
 const searchText=search.trim().toLocaleLowerCase()
 const visibleStaff=useMemo(()=>staff.filter(member=>
  (!staffFilter||member.userId===staffFilter)&&
  (!searchText||[member.name,member.fullName,member.email,member.role].some(v=>v.toLocaleLowerCase().includes(searchText)))
 ).sort((a,b)=>(b.lastSignedInAt||'').localeCompare(a.lastSignedInAt||'')||a.name.localeCompare(b.name)),[staff,staffFilter,searchText])

 const visibleLogins=useMemo(()=>{
  const cutoff=range==='all'?0:Date.now()-Number(range)*24*60*60*1000
  const eligible=new Set(visibleStaff.map(member=>member.userId))
  return logins.filter(entry=>eligible.has(entry.userId)&&new Date(entry.at).getTime()>=cutoff)
 },[logins,visibleStaff,range])

 return <div className="staff-login-page">
  <header className="staff-login-heading">
   <div><span className="staff-login-eyebrow">OWNER CONTROLS</span>
    <h2>Staff login activity</h2>
    <p>Successful account sign-ins, not ordinary page visits. Times are shown in Michigan time.</p>
   </div>
   <button type="button" className="staff-login-refresh" disabled={loading} onClick={()=>void load()}>
    <RefreshCw size={15}/>{loading?'Loading…':'Refresh'}
   </button>
  </header>
  {error&&<div className="staff-login-error" role="alert">{error}</div>}
  {report&&<>
   <div className="staff-login-stats">
    <div><Clock3 size={17}/><span>Staff with a recorded sign-in</span><strong>{staff.filter(m=>m.lastSignedInAt).length} / {staff.length}</strong></div>
    <div><ShieldCheck size={17}/><span>Login events captured</span><strong>{logins.length}</strong></div>
   </div>
   <div className="staff-login-filters">
    <label className="staff-login-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search staff" aria-label="Search staff login activity"/></label>
    <label><span>Employee</span><select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="">All staff</option>
      {[...staff].sort((a,b)=>a.name.localeCompare(b.name)).map(person=><option key={person.userId} value={person.userId}>{person.name}</option>)}
     </select></label>
    <label><span>History</span><select value={range} onChange={e=>setRange(e.target.value as Range)}>
      <option value="7">Past 7 days</option><option value="30">Past 30 days</option>
      <option value="90">Past 90 days</option><option value="all">All recorded events</option>
     </select></label>
   </div>
   <section className="staff-login-panel">
    <div className="staff-login-panel-heading"><h3>Last successful login by staff</h3><span>{visibleStaff.length} accounts</span></div>
    <div className="staff-login-table-wrap"><table className="staff-login-table"><thead><tr><th>Staff member</th><th>App role</th><th>Last sign-in</th></tr></thead>
      <tbody>{visibleStaff.map(person=><tr key={person.userId}>
       <td><strong>{person.name}</strong>{person.email&&<small>{person.email}</small>}</td>
       <td>{person.role}</td><td className="staff-login-time">{displayTime(person.lastSignedInAt)}</td>
      </tr>)}
      {!visibleStaff.length&&<tr><td colSpan={3}>No matching staff accounts.</td></tr>}
     </tbody></table></div>
    <p className="staff-login-caption">Last sign-in comes from the authentication provider, including successful logins before activity tracking was enabled. It does not mean the account is currently online.</p>
   </section>
   <section className="staff-login-panel">
    <div className="staff-login-panel-heading"><h3>Login history</h3><span>{visibleLogins.length} events</span></div>
    <p className="staff-login-caption">Individual login events are recorded from the date this feature was enabled. Older login history was not available to import. Page refreshes and app navigation do not create login events.</p>
    <div className="staff-login-history">
     {visibleLogins.map(item=><div className="staff-login-event" key={item.id}>
      <span className="staff-login-dot" aria-hidden="true"/>
      <div><strong>{item.name}</strong><small>Signed in successfully</small></div>
      <div className="staff-login-event-time"><strong>{relativeDay(item.at)}</strong><small>{displayTime(item.at)}</small></div>
     </div>)}
     {visibleLogins.length===0&&<div className="staff-login-empty">No successful sign-ins recorded for these filters since tracking began.</div>}
    </div>
    {logins.length>=report.historyLimit&&<p className="staff-login-caption">Showing only the most recent {report.historyLimit} recorded logins.</p>}
   </section>
  </>}
  {!report&&!loading&&!error&&<p>No account activity is available.</p>}
 </div>
}
