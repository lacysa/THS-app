'use client'

// A single in-flight identity request for modules mounted at the same time.
// Session information is never persisted to localStorage.
const SESSION_TTL_MS=120_000
let generation=0
let inflight: Promise<any> | null = null
let cached: { value:any; at:number } | null = null

export function invalidateStaffSession() { generation++; cached=null; inflight=null }

export function getStaffSession():Promise<any> {
  if(cached && Date.now()-cached.at < SESSION_TTL_MS)return Promise.resolve(cached.value)
  if(inflight)return inflight
  const requestGeneration=generation
  inflight=fetch('/api/me',{cache:'no-store'})
    .then(async response=>{
      if(!response.ok)throw new Error('Could not load your access.')
      const value=await response.json()
      if(generation===requestGeneration)cached={value,at:Date.now()}
      return value
    })
    .finally(()=>{if(generation===requestGeneration)inflight=null})
  return inflight
}
