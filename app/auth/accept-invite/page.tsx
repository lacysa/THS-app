'use client'

import { FormEvent,useEffect,useMemo,useState } from 'react'
import {createBrowserClient} from '@supabase/ssr'

export default function AcceptStaffInvite(){
 const [ready,setReady]=useState(false)
 const [error,setError]=useState('')
 const [password,setPassword]=useState('')
 const [confirm,setConfirm]=useState('')
 const [saving,setSaving]=useState(false)
 const supabase=useMemo(()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url&&key?createBrowserClient(url,key):null
 },[])
 useEffect(()=>{
  let active=true
  if(!supabase){setError('Account setup is unavailable. Please contact the hotel administrator.');return}
  async function checkInvitation(){
   if(!supabase)return
   const query=new URLSearchParams(window.location.search)
   const code=query.get('code')
   if(code){
    const {error:exchangeError}=await supabase.auth.exchangeCodeForSession(code)
    if(exchangeError){if(active)setError('This invitation link could not be verified. Request a new invitation.');return}
   }
   const {data,error:sessionError}=await supabase.auth.getUser()
   if(!active)return
   if(sessionError||!data.user){setError('Please open the invitation link from your email to set your password.');return}
   setReady(true)
  }
  void checkInvitation()
  return()=>{active=false}
 },[supabase])
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  if(!supabase||saving)return
  if(password.length<12){setError('Use a password with at least 12 characters.');return}
  if(password!==confirm){setError('Passwords do not match.');return}
  setSaving(true);setError('')
  try{
   const {error:updateError}=await supabase.auth.updateUser({password})
   if(updateError)throw updateError
   window.location.assign('/dashboard')
  }catch(e:any){setError(e?.message||'Unable to set your password. Request another invite.');setSaving(false)}
 }
 return <main className="login-screen">
  <section className="login-brand-panel">
   <div className="login-brand-mark">THS</div>
   <div className="login-brand-copy"><div className="ops-kicker">The Hotel Saugatuck</div><h1>Operations Hub</h1><p>Secure staff account setup</p></div>
  </section>
  <section className="login-form-panel">
   <form className="login-form-card" onSubmit={submit}>
    <div><div className="ops-kicker">Staff invitation</div><h2>Set your password</h2><p>Create a password to use with your THS staff account.</p></div>
    {error&&<div className="notice error" role="alert">{error}</div>}
    {!ready&&!error&&<p role="status">Verifying invitation…</p>}
    {ready&&<>
     <div className="field"><label htmlFor="invite-password">Password</label><input id="invite-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/></div>
     <div className="field"><label htmlFor="invite-confirm">Confirm password</label><input id="invite-confirm" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
     <button type="submit" className="login-submit" disabled={saving}>{saving?'Saving…':'Set password and continue'}</button>
    </>}
   </form>
  </section>
 </main>
}
