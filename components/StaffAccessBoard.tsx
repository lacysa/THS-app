'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, RotateCcw, Search, ShieldCheck, UsersRound } from 'lucide-react'

type ModuleAccess={
  module_key:string
  label:string
  department:string
  enabled:boolean
  published:boolean
  defaultAccess:boolean
  effectiveAccess:boolean
  override:boolean|null
}
type StaffRow={
  userId:string
  memberId:string|null
  name:string
  fullName:string
  email:string|null
  jobTitle:string|null
  roleName:string|null
  isOwner:boolean
  modules:ModuleAccess[]
}

export default function StaffAccessBoard(){
  const [staff,setStaff]=useState<StaffRow[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  async function load(){
    setLoading(true)
    const r=await fetch('/api/staff-access',{cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){ setMessage(d.error||'Could not load staff.'); setLoading(false); return }
    setStaff(d.staff||[])
    setSelectedId(id=>id || d.staff?.[0]?.userId || '')
    setLoading(false)
  }

  useEffect(()=>{ void load() },[])

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase()
    if(!q) return staff
    return staff.filter(s=>[s.name,s.fullName,s.jobTitle,s.roleName,s.email].filter(Boolean).join(' ').toLowerCase().includes(q))
  },[staff,search])

  const selected=staff.find(s=>s.userId===selectedId)||filtered[0]||null

  async function setOverride(module:ModuleAccess,allowed:boolean|null){
    if(!selected || selected.isOwner) return
    setMessage('Saving…')
    const r=await fetch('/api/staff-access',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({user_id:selected.userId,staff_member_id:selected.memberId,module_key:module.module_key,allowed})
    })
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not update access.');return}

    setStaff(rows=>rows.map(row=>{
      if(row.userId!==selected.userId) return row
      return {...row,modules:row.modules.map(m=>{
        if(m.module_key!==module.module_key) return m
        const effective=allowed===null?m.defaultAccess:allowed
        return {...m,override:allowed,effectiveAccess:effective}
      })}
    }))
    setMessage('Saved.')
  }


  async function startPreview(){
    if(!selected || selected.isOwner) return
    setMessage(`Opening ${selected.name}'s actual app view…`)
    const r=await fetch('/api/staff-preview',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({user_id:selected.userId})
    })
    const d=await r.json().catch(()=>({}))
    if(!r.ok){
      setMessage(d.error||'Could not start staff preview.')
      return
    }
    window.location.assign('/dashboard')
  }

  if(loading) return <div className="staff-access-loading">Loading staff…</div>

  return <div className="staff-access-page">
    {message&&<div className="staff-access-message">{message}</div>}

    <section className="staff-access-hero">
      <div>
        <span>OWNER CONTROLS</span>
        <h1>Staff access</h1>
        <p>Choose an employee to review or edit their module permissions.</p>
      </div>
      <UsersRound size={30}/>
    </section>

    <div className="staff-access-mobile-picker"><label>Choose employee<select value={selected?.userId||''} onChange={e=>setSelectedId(e.target.value)}>{filtered.map(person=><option key={person.userId} value={person.userId}>{person.name} · {person.jobTitle||person.roleName||'Staff'}</option>)}</select></label></div>
    <div className="staff-access-layout">
      <aside className="staff-access-list">
        <div className="staff-access-search">
          <Search size={16}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search staff…"/>
        </div>
        <div className="staff-access-people">
          {filtered.map(person=><button
            key={person.userId}
            className={selected?.userId===person.userId?'selected':''}
            onClick={()=>setSelectedId(person.userId)}
          >
            <span className="staff-access-avatar">{person.name.slice(0,2).toUpperCase()}</span>
            <span>
              <strong>{person.name}</strong>
              <small>{person.jobTitle||person.roleName||'Staff'}</small>
            </span>
          </button>)}
        </div>
      </aside>

      {selected&&<section className="staff-access-detail">
        <header>
          <div>
            <span>{selected.roleName||'Staff'}</span>
            <h2>{selected.name}</h2>
            <p>{selected.jobTitle||selected.email||''}</p>
          </div>
          <div className="staff-access-header-actions">
            {!selected.isOwner&&<button type="button" className="staff-access-preview-btn" onClick={()=>void startPreview()}>
              <Eye size={16}/> Preview view
            </button>}
            <div className="staff-access-summary">
              <ShieldCheck size={18}/>
              <strong>{selected.modules.filter(m=>m.effectiveAccess).length}</strong>
              <span>modules visible</span>
            </div>
          </div>
        </header>

        {selected.isOwner&&<div className="staff-access-owner-note">Owner access is always available and cannot be restricted here.</div>}

        <div className="staff-access-modules">
          {selected.modules
            .filter(m=>m.module_key!=='staff' || selected.isOwner)
            .map(module=><div className="staff-access-module" key={module.module_key}>
              <div className="staff-access-module-copy">
                <strong>{module.label}</strong>
                <span>
                  {module.override===null
                    ? `Role default: ${module.defaultAccess?'Visible':'Hidden'}`
                    : `Override: ${module.effectiveAccess?'Visible':'Hidden'}`}
                  {!module.enabled?' · disabled globally':''}
                  {!module.published?' · preview/unpublished':''}
                </span>
              </div>

              <div className="staff-access-module-actions">
                {module.override!==null&&!selected.isOwner&&<button
                  type="button"
                  className="staff-access-reset"
                  onClick={()=>void setOverride(module,null)}
                  title="Reset to role default"
                ><RotateCcw size={14}/> Default</button>}
                <label className="staff-access-switch">
                  <input
                    type="checkbox"
                    checked={module.effectiveAccess}
                    disabled={selected.isOwner || module.module_key==='staff' || !selected.memberId || !module.enabled}
                    onChange={e=>void setOverride(module,e.target.checked)}
                  />
                  <span>{module.effectiveAccess?'Visible':'Hidden'}</span>
                </label>
              </div>
            </div>)}
        </div>
      </section>}
    </div>

  </div>
}
