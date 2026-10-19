import nodemailer from 'nodemailer'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const HOTEL_FROM='innkeeper@thehotelsaugatuck.com'
export function invitationMail({name,username,url,role}:{name:string;username:string;url:string;role:string}){
 const safe=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))
 const first=name.trim().split(/\s+/)[0]||'there'
 const plain=`Hi ${first},

You've been invited to access THS Operations Hub, The Hotel Saugatuck's staff operations platform.

Your account has been assigned ${role} access.

Get started

Use the secure invitation link below to activate your account and create your password.

Activate Your Account: ${url}

Once your password is set, you can sign in to THS Operations Hub using your email address or username.

Username: ${username}

If you have any trouble accessing your account, please contact Sarah.

Thank you,
The Hotel Saugatuck`
 const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#304654;max-width:540px;margin:auto;font-size:15px;line-height:1.65"><h2 style="color:#324c5e">THS Operations Hub</h2><p>Hi ${safe(first)},</p><p>You've been invited to access <strong>THS Operations Hub</strong>, The Hotel Saugatuck's staff operations platform.</p><p>Your account has been assigned <strong>${safe(role)}</strong> access.</p><h3>Get started</h3><p>Use the secure invitation link below to activate your account and create your password.</p><p style="margin:26px 0"><a href="${safe(url)}" style="background:#365c79;border-radius:9px;color:white;padding:13px 18px;text-decoration:none;font-weight:bold">Activate Your Account</a></p><p>Once your password is set, you can sign in to THS Operations Hub using your email address or username.</p><p><strong>Username:</strong> ${safe(username)}</p><p>If you have any trouble accessing your account, please contact Sarah.</p><p>Thank you,<br/><strong>The Hotel Saugatuck</strong></p></div>`
 return {subject:'Your Invitation to THS Operations Hub',text:plain,html}
}
export function rackspaceConfigured(){
 return Boolean(process.env.THS_SMTP_PASSWORD&&process.env.THS_SMTP_FROM===HOTEL_FROM&&process.env.THS_SMTP_USER===HOTEL_FROM)
}
export async function sendHotelInvite({email,name,username,role,origin}:{email:string;name:string;username:string;role:string;origin:string}){
 if(!rackspaceConfigured())throw new Error('Rackspace SMTP is not configured. Add THS_SMTP_PASSWORD in Vercel before sending invitations.')
 const admin=createSupabaseAdmin()
 const {data,error}=await admin.auth.admin.generateLink({
  type:'recovery',email,
  options:{redirectTo:new URL('/auth/accept-invite',origin).toString()}
 })
 if(error||!data?.properties?.action_link)throw new Error(error?.message||'Could not generate a secure account setup link')
 const message=invitationMail({name,username,role,url:data.properties.action_link})
 const transport=nodemailer.createTransport({
  host:process.env.THS_SMTP_HOST||'secure.emailsrvr.com',
  port:Number(process.env.THS_SMTP_PORT||465),secure:true,
  auth:{user:HOTEL_FROM,pass:process.env.THS_SMTP_PASSWORD},
  connectionTimeout:12000,greetingTimeout:12000,socketTimeout:18000
 })
 await transport.sendMail({from:{name:'The Hotel Saugatuck',address:HOTEL_FROM},to:email,subject:message.subject,text:message.text,html:message.html})
 return {sent:true,from:HOTEL_FROM}
}
