'use client'

import { useEffect, useState } from 'react'

type Access = {
  name:string; preferredName:string|null; email:string|null; phone:string|null; jobTitle:string|null;
  theme:'light'|'blue'|'dark'; roleName:string|null; canManageModules:boolean
}

type Module = { module_key:string; title:string; label:string|null; enabled:boolean; published:boolean; status:string; active:boolean }

export default function SettingsPanel({initial}:{initial:Access}){
  const [profile,setProfile] = useState({name:initial.name,preferred_name:initial.preferredName||'',email:initial.email||'',phone:initial.phone||'',job_title:initial.jobTitle||'',theme_preference:initial.theme})
  const [modules,setModules] = useState<Module[]>([])
  const [message,setMessage] = useState('')
  const [password,setPassword] = useState('')

  useEffect(()=>{
    fetch('/api/me').then(r=>r.json()).then(d=>setModules((d.modules||[]).filter((m:Module)=>m.active!==false)))
  },[])

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
