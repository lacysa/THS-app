'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileUp, RefreshCw, ShieldCheck, TriangleAlert, UploadCloud } from 'lucide-react'

type PreviewRow = {
  reservationKey:string
  reservationNumber:string|null
  guestName:string
  phone:string|null
  doorCode:string|null
  arrivalDate:string|null
  checkoutDate:string|null
  roomName:string|null
  occupancy:number|null
  ratePlan:string|null
  checkInTime:string|null
  productsRaw:string|null
  dietaryRestrictions:string|null
  referralSource:string|null
  reasonForVisit:string|null
  guestComments:string|null
  innkeeperNotes:string|null
  sourcePage:number
  confidence:number
  needsReview:boolean
  warnings:string[]
  changeType:'new'|'updated'|'unchanged'
  changedFields:Record<string,any>
  include:boolean
  rawText:string
}

type Room = {id:string,name:string}

function localDate(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit'}).format(new Date()) }

export default function ReservationSyncBoard(){
  const [file,setFile]=useState<File|null>(null)
  const [progress,setProgress]=useState('')
  const [pct,setPct]=useState(0)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [rows,setRows]=useState<PreviewRow[]>([])
  const [rooms,setRooms]=useState<Room[]>([])
  const [reportStart,setReportStart]=useState<string|null>(null)
  const [reportEnd,setReportEnd]=useState<string|null>(null)
  const [warnings,setWarnings]=useState<string[]>([])
  const [batches,setBatches]=useState<any[]>([])
  const [verification,setVerification]=useState<any>(null)
  const [daily,setDaily]=useState<any[]>([])
  const [verifyDate,setVerifyDate]=useState(localDate())

  async function loadMeta(date=verifyDate){
    const r=await fetch(`/api/reservation-sync?date=${encodeURIComponent(date)}`,{cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(r.ok){ setRooms(d.rooms||[]); setBatches(d.batches||[]); setVerification(d.verification||null); setDaily(d.daily||[]) }
  }

  useEffect(()=>{ void loadMeta() },[])
  useEffect(()=>{ void loadMeta(verifyDate) },[verifyDate])

  async function extractPdf(selected:File){
    setProgress('Reading PDF…'); setPct(2)
    const pdfjs:any=await import('pdfjs-dist/legacy/build/pdf.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await selected.arrayBuffer())}).promise
    const pages:string[]=[]
    let worker:any=null

    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i)
      const content=await page.getTextContent()
      let text=(content.items||[]).map((item:any)=>`${item.str||''}${item.hasEOL?'\n':' '}`).join('').replace(/[^\S\r\n]+/g,' ').trim()
      if(text.length<180){
        if(!worker){
          setProgress('Starting document reader…')
          const tess:any=await import('tesseract.js')
          worker=await tess.createWorker('eng')
        }
        setProgress(`Reading page ${i} of ${pdf.numPages}…`)
        const viewport=page.getViewport({scale:2})
        const canvas=document.createElement('canvas')
        canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height)
        const ctx=canvas.getContext('2d',{willReadFrequently:true})
        if(!ctx) throw new Error('Could not create the PDF reader canvas.')
        await page.render({canvasContext:ctx,viewport}).promise
        const result=await worker.recognize(canvas)
        text=result?.data?.text||''
      }
      pages.push(text)
      setPct(Math.round((i/pdf.numPages)*78))
    }
    if(worker) await worker.terminate()
    return pages
  }

  async function preview(){
    if(!file) return
    setBusy(true); setError(''); setSuccess(''); setRows([])
    try{
      const pages=await extractPdf(file)
      setProgress('Comparing with current reservation data…'); setPct(86)
      const r=await fetch('/api/reservation-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview',pages})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not preview this report.')
      setRows(d.reservations||[]); setReportStart(d.reportStartDate||null); setReportEnd(d.reportEndDate||null); setWarnings(d.warnings||[])
      setProgress(`Preview ready: ${(d.reservations||[]).length} reservations found.`); setPct(100)
    }catch(e:any){ setError(e?.message||'Could not read this report.'); setProgress(''); setPct(0) }
    finally{ setBusy(false) }
  }

  function patch(index:number,patch:Partial<PreviewRow>){ setRows(current=>current.map((r,i)=>i===index?{...r,...patch}:r)) }

  async function commit(){
    const selected=rows.filter(r=>r.include)
    if(!selected.length) return
    setBusy(true); setError(''); setSuccess(''); setProgress('Updating reservations and daily room operations…'); setPct(30)
    try{
      const r=await fetch('/api/reservation-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        action:'commit',fileName:file?.name||'Arrival Report.pdf',reportStartDate:reportStart,reportEndDate:reportEnd,
        reservations:rows,warnings,warningCount:warnings.length
      })})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Import failed.')
      setPct(100); setProgress('Import complete.'); setSuccess(`${d.imported} reservations synced. Room status, stay details, door codes and matched packages were updated through ${d.end}.`)
      await loadMeta()
    }catch(e:any){ setError(e?.message||'Import failed.') }
    finally{ setBusy(false) }
  }

  async function verify(){
    setBusy(true); setError('')
    try{
      const r=await fetch('/api/reservation-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',serviceDate:verifyDate})})
      const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Could not verify this day.')
      await loadMeta(verifyDate)
    }catch(e:any){ setError(e?.message||'Could not verify this day.') }
    finally{ setBusy(false) }
  }

  const stats=useMemo(()=>({
    total:rows.length,newCount:rows.filter(r=>r.changeType==='new').length,updated:rows.filter(r=>r.changeType==='updated').length,
    review:rows.filter(r=>r.needsReview).length,selected:rows.filter(r=>r.include).length
  }),[rows])

  return <div className="rs-wrap">
    <section className="rs-hero-card">
      <div>
        <div className="rs-kicker">PMS → Operations Hub</div>
        <h1>Reservation Sync</h1>
        <p>Upload the downloadable Arrival Report. The app reads it, compares reservations with the last import, then updates daily room status and stay information without touching housekeeping progress, assignments, sign-offs or EOS work.</p>
      </div>
      <div className="rs-verify-card">
        <div className="rs-verify-title"><ShieldCheck size={18}/> Daily verification</div>
        <input type="date" value={verifyDate} onChange={e=>setVerifyDate(e.target.value)}/>
        {verification ? <div className="rs-verified"><CheckCircle2 size={16}/> Verified {new Date(verification.verified_at).toLocaleString()}</div> : <button className="rs-btn rs-secondary" onClick={verify} disabled={busy}>Mark day verified</button>}
      </div>
    </section>

    {daily.length>0 && <section className="rs-daily-board">
      <div className="rs-daily-head">
        <div><div className="rs-kicker">Daily operations</div><h2>{verifyDate} stay information</h2></div>
        <span>{daily.filter(r=>r.status!=='Vacant').length} occupied / changing rooms</span>
      </div>
      <div className="rs-daily-grid">
        {daily.filter(item=>item.status!=='Vacant').map(item=>{
          const stay=item.arriving||item.primary||item.departing
          return <article className={`rs-daily-room status-${String(item.status||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`} key={item.roomId}>
            <div className="rs-daily-room-top"><strong>{item.roomName}</strong><span>{item.status}</span></div>
            {item.status==='Out/In' && <div className="rs-outin"><span>OUT {item.departing?.guest_name||'—'}</span><span>IN {item.arriving?.guest_name||'—'}</span></div>}
            {stay && <div className="rs-daily-info">
              <div><b>Guest</b><span>{stay.guest_name||'—'}</span></div>
              <div><b>Door</b><span className="rs-door-code">{stay.door_code||'—'}</span></div>
              <div><b>Stay</b><span>{stay.arrival_date} → {stay.checkout_date}</span></div>
              <div><b>Check-in</b><span>{stay.check_in_time||'—'}</span></div>
              {stay.products_raw&&<div className="wide"><b>Packages</b><span>{stay.products_raw}</span></div>}
              {stay.innkeeper_notes&&<div className="wide"><b>Innkeeper</b><span>{stay.innkeeper_notes}</span></div>}
              {stay.guest_comments&&<div className="wide"><b>Guest comment</b><span>{stay.guest_comments}</span></div>}
              {stay.dietary_restrictions&&<div className="wide"><b>Dietary</b><span>{stay.dietary_restrictions}</span></div>}
            </div>}
          </article>
        })}
      </div>
    </section>}

    <section className="rs-upload-card">
      <label className={`rs-drop ${file?'has-file':''}`}>
        <input type="file" accept="application/pdf,.pdf" onChange={e=>{setFile(e.target.files?.[0]||null);setRows([]);setError('');setSuccess('')}}/>
        <UploadCloud size={34}/>
        <strong>{file?file.name:'Drop the Arrival Report PDF here'}</strong>
        <span>{file?'Ready to read and compare.':'or click to choose the downloaded PDF'}</span>
      </label>
      <div className="rs-upload-actions">
        <button className="rs-btn" disabled={!file||busy} onClick={preview}>{busy?<RefreshCw className="spin" size={17}/>:<FileUp size={17}/>} Read & preview changes</button>
        <span className="rs-private-note">The PDF is read for this import. Staff never need to upload it to Supabase manually.</span>
      </div>
      {progress && <div className="rs-progress"><div><span style={{width:`${pct}%`}}/></div><small>{progress}</small></div>}
      {error && <div className="rs-alert error"><TriangleAlert size={17}/>{error}</div>}
      {success && <div className="rs-alert success"><CheckCircle2 size={17}/>{success}</div>}
    </section>

    {rows.length>0 && <>
      <section className="rs-stats">
        <div><span>Total found</span><strong>{stats.total}</strong></div><div><span>New</span><strong>{stats.newCount}</strong></div>
        <div><span>Changed</span><strong>{stats.updated}</strong></div><div><span>Needs review</span><strong>{stats.review}</strong></div>
      </section>
      {warnings.length>0 && <div className="rs-alert warning"><TriangleAlert size={17}/><div>{warnings.map(w=><div key={w}>{w}</div>)}</div></div>}
      <section className="rs-review-head">
        <div><h2>Review before import</h2><p>Rows with uncertain OCR are left unchecked. Fix them, then include them when they are accurate.</p></div>
        <button className="rs-btn" disabled={busy||stats.selected===0} onClick={commit}>Import {stats.selected} selected</button>
      </section>
      <section className="rs-reservations">
        {rows.map((row,index)=><article className={`rs-reservation ${row.needsReview?'needs-review':''}`} key={`${row.reservationKey}-${index}`}>
          <div className="rs-row-top">
            <label className="rs-include"><input type="checkbox" checked={row.include} onChange={e=>patch(index,{include:e.target.checked})}/> Include</label>
            <span className={`rs-change ${row.changeType}`}>{row.changeType}</span>
            <span className="rs-confidence">Page {row.sourcePage} · {Math.round(row.confidence)}% read confidence</span>
          </div>
          {row.warnings?.length>0 && <div className="rs-row-warning">{row.warnings.join(' · ')}</div>}
          <div className="rs-fields">
            <label>Guest<input value={row.guestName||''} onChange={e=>patch(index,{guestName:e.target.value})}/></label>
            <label>Room<select value={row.roomName||''} onChange={e=>patch(index,{roomName:e.target.value||null})}><option value="">Choose room</option>{rooms.map(room=><option key={room.id}>{room.name}</option>)}</select></label>
            <label>Arrival<input type="date" value={row.arrivalDate||''} onChange={e=>patch(index,{arrivalDate:e.target.value||null})}/></label>
            <label>Checkout<input type="date" value={row.checkoutDate||''} onChange={e=>patch(index,{checkoutDate:e.target.value||null})}/></label>
            <label>Phone<input value={row.phone||''} onChange={e=>{const digits=e.target.value.replace(/\D/g,'');patch(index,{phone:e.target.value,doorCode:digits.length>=4?digits.slice(-4):null})}}/></label>
            <label>Door code<input value={row.doorCode||''} readOnly/></label>
            <label>Occupancy<input type="number" min="1" max="8" value={row.occupancy||''} onChange={e=>patch(index,{occupancy:e.target.value?Number(e.target.value):null})}/></label>
            <label>Check-in<input value={row.checkInTime||''} onChange={e=>patch(index,{checkInTime:e.target.value})}/></label>
            <label className="wide">Rate / booking product<input value={row.ratePlan||''} onChange={e=>patch(index,{ratePlan:e.target.value})}/></label>
            <label className="wide">Packages / products<input value={row.productsRaw||''} onChange={e=>patch(index,{productsRaw:e.target.value})}/></label>
            <label className="wide">Innkeeper notes<textarea value={row.innkeeperNotes||''} onChange={e=>patch(index,{innkeeperNotes:e.target.value})}/></label>
            <label className="wide">Guest comments<textarea value={row.guestComments||''} onChange={e=>patch(index,{guestComments:e.target.value})}/></label>
          </div>
        </article>)}
      </section>
    </>}

    <section className="rs-history">
      <h2>Recent imports</h2>
      {!batches.length?<p>No imports yet.</p>:batches.map(b=><div className="rs-history-row" key={b.id}><div><strong>{b.file_name}</strong><span>{b.report_start_date||'—'} → {b.report_end_date||'—'}</span></div><div><strong>{b.records_imported||0}</strong><span>reservations</span></div><div><span className={`rs-change ${b.status}`}>{b.status}</span></div></div>)}
    </section>
  </div>
}
