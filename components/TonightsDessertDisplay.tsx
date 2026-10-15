'use client'

import {useEffect,useState} from 'react'

type DessertInfo={reportDate:string;breakfastDate:string;dessert:string}

/** One small, read-only dessert note; does not interact with breakfast forms. */
export default function TonightsDessertDisplay({serviceDate}:{serviceDate:string}){
  const [info,setInfo]=useState<DessertInfo|null>(null)
  const [error,setError]=useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    setInfo(null)
    setError(false)
    fetch('/api/tonights-dessert?serviceDate='+encodeURIComponent(serviceDate),{
      cache:'no-store',signal:controller.signal
    }).then(async response=>{
      if(!response.ok)throw new Error('Dessert unavailable')
      return response.json() as Promise<DessertInfo>
    }).then(data=>{if(!controller.signal.aborted)setInfo(data)})
      .catch(()=>{if(!controller.signal.aborted)setError(true)})
    return()=>controller.abort()
  },[serviceDate])

  return <section className="ths-tonights-dessert-display" aria-label="Tonight's Dessert">
    <div className="ths-tonights-dessert-display-heading">
      <strong>Tonight&apos;s Dessert</strong>
      {info&&<small>For breakfast {info.breakfastDate}</small>}
    </div>
    <p>{error?'Dessert information unavailable':!info?'Loading dessert…':info.dessert||'Not entered in Shift Report yet'}</p>
  </section>
}
