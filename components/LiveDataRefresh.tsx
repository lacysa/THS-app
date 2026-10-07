'use client'

import { useEffect,useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function LiveDataRefresh({intervalMs=10000}:{intervalMs?:number}){
  const router=useRouter()
  const refreshing=useRef(false)

  useEffect(()=>{
    const refresh=()=>{
      if(document.visibilityState!=='visible'||refreshing.current)return
      refreshing.current=true
      router.refresh()
      window.setTimeout(()=>{refreshing.current=false},1200)
    }

    const id=window.setInterval(refresh,intervalMs)
    const onFocus=()=>refresh()
    const onVisibility=()=>{if(document.visibilityState==='visible')refresh()}

    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onVisibility)

    return ()=>{
      window.clearInterval(id)
      window.removeEventListener('focus',onFocus)
      document.removeEventListener('visibilitychange',onVisibility)
    }
  },[intervalMs,router])

  return null
}
