import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function env(name:string){ return process.env[name] }
export async function middleware(request:NextRequest){
  const url=env('NEXT_PUBLIC_SUPABASE_URL')||env('SUPABASE_URL')
  const key=env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')||env('NEXT_PUBLIC_SUPABASE_ANON_KEY')||env('SUPABASE_PUBLISHABLE_KEY')||env('SUPABASE_ANON_KEY')
  if(!url||!key){const login=request.nextUrl.clone();login.pathname='/login';login.searchParams.set('config','missing');return NextResponse.redirect(login)}
  let response=NextResponse.next({request})
  const supabase=createServerClient(url,key,{cookies:{getAll(){return request.cookies.getAll()},setAll(cookiesToSet:any[]){cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options))}}})
  // Validate the signed session locally when possible. getUser() on every
  // navigation was triggering overlapping /token refresh requests (409),
  // especially when multiple tabs or staff dashboards were active.
  const {data:claims,error:authError}=await supabase.auth.getClaims()
  if(authError||!claims?.claims?.sub){const login=request.nextUrl.clone();login.pathname='/login';return NextResponse.redirect(login)}
  return response
}
export const config={matcher:['/dashboard/:path*','/front-desk/:path*','/kitchen/:path*','/breakfast/menu-manager/:path*','/breakfast/overview/:path*','/settings/:path*','/housekeeping/:path*','/room-checks/:path*','/projects/:path*','/maintenance/:path*']}
