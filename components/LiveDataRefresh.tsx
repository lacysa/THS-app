'use client'

import { useEffect } from 'react'

/**
 * Non-disruptive live-data signal.
 *
 * This intentionally does NOT call router.refresh(). Operational staff may be
 * halfway through a room check, typing a note, or working far down a mobile
 * page. A background server-component refresh used to remount those views and
 * move the screen. Consumers that want live updates can listen for
 * `ths:live-data-refresh` and merge fresh data into local state.
 */
export default function LiveDataRefresh({intervalMs=10000}:{intervalMs?:number}){
  useEffect(()=>{
    const notify=()=>{
      if(document.visibilityState!=='visible')return
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
    }

    const id=window.setInterval(notify,intervalMs)
    const onFocus=()=>notify()
    const onVisibility=()=>{if(document.visibilityState==='visible')notify()}

    window.addEventListener('focus',onFocus)
    document.addEventListener('visibilitychange',onVisibility)
    return ()=>{
      window.clearInterval(id)
      window.removeEventListener('focus',onFocus)
      document.removeEventListener('visibilitychange',onVisibility)
    }
  },[intervalMs])

  return null
}
