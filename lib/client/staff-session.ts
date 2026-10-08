'use client'

// A single in-flight identity request for modules mounted at the same time.
// Session information is never persisted to localStorage.
let inflight: Promise<any> | null = null
let cached: { value:any; at:number } | null = null

export function invalidateStaffSession() { cached=null; inflight=null }

export function getStaffSession():Promise<any> {
  if(cached && Date.now()-cached.at < 20000)return Promise.resolve(cached.value)
  if(inflight)return inflight
  inflight=fetch('/api/me',{cache:'no-store'})
    .then(async response=>{
      if(!response.ok)throw new Error('Could not load your access.')
      const value=await response.json()
      cached={value,at:Date.now()}
      return value
    })
    .finally(()=>{inflight=null})
  return inflight
}
