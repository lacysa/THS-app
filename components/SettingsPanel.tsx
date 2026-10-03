'use client'

import { useEffect, useState } from 'react'

type Access = {
  name:string; preferredName:string|null; email:string|null; phone:string|null; jobTitle:string|null;
  theme:'light'|'blue'|'dark'; roleName:string|null; canManageModules:boolean
}

type Module = { module_key:string; title:string; label:string|null; enabled:boolean; published:boolean; status:string; active:boolean; department?:string }
type StaffMember = { id:string; auth_user_id:string|null; name:string; username:string|null; job_title:string|null; active:boolean }
type StaffOverride = { staff_member_id:string; module_key:string; allowed:boolean }

export default function SettingsPanel({initial}:{initial:Access}){
  const [profile,setProfile] = useState({name:initial.name,preferred_name:initial.preferredName||'',email:initial.email||'',phone:initial.phone||'',job_title:initial.jobTitle||'',theme_preference:initial.theme})
  const [modules,setModules] = useState<Module[]>([])
  const [message,setMessage] = useState('')
  const [password,setPassword] = useState('')
  const [staff,setStaff] = useState<StaffMember[]>([])
  const [permissionModules,setPermissionModules] = useState<Module[]>([])
  const [overrides,setOverrides] = useState<StaffOverride[]>([])
  const [selectedStaffId,setSelectedStaffId] = useState('')
  const [permissionsLoading,setPermissionsLoading] = useState(false)

  useEffect(()=>{
    fetch('/api/me').then(r=>r.json()).then(d=>setModules((d.modules||[]).filter((m:Module)=>m.active!==false)))
  },[])

  useEffect(()=>{
    if (!initial.canManageModules) return
    setPermissionsLoading(true)
    fetch('/api/settings/staff-permissions')
      .then(r=>r.json().then(d=>({ok:r.ok,d})))
      .then(({ok,d})=>{
        if (!ok) throw new Error(d.error || 'Could not load staff permissions.')
        setStaff(d.staff || [])
        setPermissionModules((d.modules || []).filter((m:Module)=>m.active!==false))
        setOverrides(d.overrides || [])
        if (!selectedStaffId && d.staff?.length) setSelectedStaffId(d.staff[0].id)
      })
      .catch(e=>setMessage(e?.message || 'Could not load staff permissions.'))
      .finally(()=>setPermissionsLoading(false))
  },[initial.canManageModules])

  useEffect(()=>{
    document.documentElement.dataset.theme = profile.theme_preference
  },[profile.theme_preference])

  async function saveProfile(){
    setMessage('Saving…')
    const r = await fetch('/api/settings/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(profile)})
    const d = await r.json(); setMessage(r.ok?'Saved.':d.error||'Could not save.')
  }

  async function changePassword(){
    const r = await fetch('/api/settings/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})})
    const d = await r.json(); setMessage(r.ok?'Password updated.':d.error||'Could not update password.'); if(r.ok)setPassword('')
  }

  async function sendReset(){
    const r = await fetch('/api/settings/reset-password',{method:'POST'}); const d = await r.json(); setMessage(r.ok?'Password reset email sent.':d.error||'Could not send reset email.')
  }

  async function toggleModule(module_key:string,key:'enabled'|'published',value:boolean){
    setModules(ms=>ms.map(m=>m.module_key===module_key?{...m,[key]:value}:m))
    const r = await fetch('/api/settings/modules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module_key,[key]:value})})
    if(!r.ok){ const d=await r.json(); setMessage(d.error||'Could not update module.'); setModules(ms=>ms.map(m=>m.module_key===module_key?{...m,[key]:!value}:m)) }
  }

  function permissionMode(staffMemberId:string,moduleKey:string):'default'|'allow'|'deny' {
    const row = overrides.find(o=>o.staff_member_id===staffMemberId && o.module_key===moduleKey)
    if (!row) return 'default'
    return row.allowed ? 'allow' : 'deny'
  }

  async function setPermission(staffMemberId:string,moduleKey:string,mode:'default'|'allow'|'deny'){
    const previous = permissionMode(staffMemberId,moduleKey)

    setOverrides(current=>{
      const rest = current.filter(o=>!(o.staff_member_id===staffMemberId && o.module_key===moduleKey))
      if(mode==='default') return rest
      return [...rest,{staff_member_id:staffMemberId,module_key:moduleKey,allowed:mode==='allow'}]
    })

    const r = await fetch('/api/settings/staff-permissions',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({staffMemberId,moduleKey,mode})
    })
    const d = await r.json().catch(()=>({}))
    if(!r.ok){
      setMessage(d.error || 'Could not update staff permission.')
      setOverrides(current=>{
        const rest = current.filter(o=>!(o.staff_member_id===staffMemberId && o.module_key===moduleKey))
        if(previous==='default') return rest
        return [...rest,{staff_member_id:staffMemberId,module_key:moduleKey,allowed:previous==='allow'}]
      })
      return
    }
    setMessage('Staff permission updated.')
  }


  return <div className="settings-wrap">
    {message && <div className="settings-message">{message}</div>}
    <section className="settings-card">
      <h2>Profile</h2><p>Update your personal account information. Your role is managed separately.</p>
      <div className="settings-grid">
        <label>Name<input value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
        <label>Preferred name<input value={profile.preferred_name} onChange={e=>setProfile({...profile,preferred_name:e.target.value})}/></label>
        <label>Email<input type="email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label>
        <label>Phone<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label>
        <label>Job title<input value={profile.job_title} onChange={e=>setProfile({...profile,job_title:e.target.value})}/></label>
        <label>Role<input value={initial.roleName||''} disabled/></label>
      </div>
      <button className="settings-primary" onClick={saveProfile}>Save profile</button>
    </section>

    <section className="settings-card">
      <h2>Security</h2>
      <div className="settings-inline"><input type="password" placeholder="New password (8+ characters)" value={password} onChange={e=>setPassword(e.target.value)}/><button onClick={changePassword}>Change password</button></div>
      <button className="settings-secondary" onClick={sendReset}>Send password reset email</button>
    </section>

    <section className="settings-card">
      <h2>Appearance</h2><p>Your theme follows your staff account.</p>
      <div className="theme-picker">
        {(['light','blue','dark'] as const).map(t=><button key={t} onClick={()=>setProfile({...profile,theme_preference:t})} className={profile.theme_preference===t?'selected':''}>
          <span className={`theme-preview ${t}`}><i/><i/><i/></span><strong>{t==='light'?'Light':t==='blue'?'Blue':'Dark'}</strong>
        </button>)}
      </div>
      <button className="settings-primary" onClick={saveProfile}>Save appearance</button>
    </section>

    {initial.canManageModules && <section className="settings-card">
      <h2>Staff permissions</h2>
      <p>Choose exactly which modules each employee can access. Default follows their role and capabilities. Allow grants access; Deny hides and blocks the module for that employee.</p>

      {permissionsLoading ? <div className="settings-permissions-loading">Loading staff permissions…</div> : <>
        <div className="settings-permissions-toolbar">
          <label>
            Staff member
            <select value={selectedStaffId} onChange={e=>setSelectedStaffId(e.target.value)}>
              {staff.map(person=><option key={person.id} value={person.id}>
                {person.name}{person.job_title ? ` · ${person.job_title}` : ''}
              </option>)}
            </select>
          </label>
          {selectedStaffId && <div className="settings-selected-user">
            <strong>{staff.find(s=>s.id===selectedStaffId)?.name}</strong>
            <span>{staff.find(s=>s.id===selectedStaffId)?.username || 'No username assigned'}</span>
          </div>}
        </div>

        <div className="staff-permission-list">
          {permissionModules.map(m=>{
            const mode = permissionMode(selectedStaffId,m.module_key)
            return <div className="staff-permission-row" key={m.module_key}>
              <div className="staff-permission-copy">
                <strong>{m.title}</strong>
                <span>{m.department || 'general'} · {m.status}{m.enabled===false?' · disabled globally':''}{m.published===false?' · unpublished':''}</span>
              </div>
              <div className="permission-segmented" role="group" aria-label={`${m.title} permission`}>
                {(['default','allow','deny'] as const).map(value=>
                  <button
                    type="button"
                    key={value}
                    className={mode===value?`selected ${value}`:value}
                    onClick={()=>setPermission(selectedStaffId,m.module_key,value)}
                    disabled={!selectedStaffId}
                  >
                    {value==='default'?'Default':value==='allow'?'Allow':'Deny'}
                  </button>
                )}
              </div>
            </div>
          })}
        </div>
      </>}
    </section>}

    {initial.canManageModules && <section className="settings-card">
      <h2>Platform</h2><p>Owner controls. Unpublished modules remain visible to you for testing but hidden from normal staff.</p>
      <div className="module-settings-list">
        {modules.map(m=><div className="module-setting" key={m.module_key}>
          <div><strong>{m.title}</strong><span>{m.status}{!m.published?' · preview only':''}</span></div>
          <label className="switch-label">Enabled <input type="checkbox" checked={m.enabled} onChange={e=>toggleModule(m.module_key,'enabled',e.target.checked)}/></label>
          <label className="switch-label">Published <input type="checkbox" checked={m.published} onChange={e=>toggleModule(m.module_key,'published',e.target.checked)}/></label>
        </div>)}
      </div>
    </section>}
  </div>
}
