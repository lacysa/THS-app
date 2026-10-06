'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardPaste, FileUp, RefreshCw, ShieldCheck, TriangleAlert, UploadCloud } from 'lucide-react'

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

function isoFromUsDate(value:string){
  const m=String(value||'').match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/)
  return m ? m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0') : null
}

function cellText(cell:Element){
  const clone=cell.cloneNode(true) as HTMLElement
  clone.querySelectorAll('br').forEach(br=>br.replaceWith('\n'))
  clone.querySelectorAll('div,p').forEach(el=>{
    el.insertAdjacentText('beforebegin','\n')
    el.insertAdjacentText('afterend','\n')
  })
  return String(clone.textContent||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim()
}

function extractLabeled(text:string,start:string,stops:string[]){
  const lower=text.toLowerCase()
  const startIndex=lower.indexOf(start.toLowerCase())
  if(startIndex<0) return null
  const from=startIndex+start.length
  let end=text.length
  for(const stop of stops){
    const idx=lower.indexOf(stop.toLowerCase(),from)
    if(idx>=0) end=Math.min(end,idx)
  }
  return text.slice(from,end).replace(/^[\s:;/\-|]+|[\s:;/\-|]+$/g,'').trim()||null
}

function parseNoteText(text:string){
  const dietaryLabel='Do you have any dietary restrictions?'
  const referralLabel='How did you hear about us?'
  const reasonLabel='Reason for Your Visit:'
  const guestLabel='[GUEST COMMENT]:'
  const innkeeperLabel='[INNKEEPER NOTES]:'
  return {
    dietaryRestrictions:extractLabeled(text,dietaryLabel,[referralLabel,reasonLabel,guestLabel,innkeeperLabel]),
    referralSource:extractLabeled(text,referralLabel,[reasonLabel,guestLabel,innkeeperLabel]),
    reasonForVisit:extractLabeled(text,reasonLabel,[guestLabel,innkeeperLabel]),
    guestComments:extractLabeled(text,guestLabel,[innkeeperLabel]),
    innkeeperNotes:extractLabeled(text,innkeeperLabel,[])
  }
}

function parsePmsTableHtml(html:string,roomNames:string[]){
  const doc=new DOMParser().parseFromString(html,'text/html')
  const tables=Array.from(doc.querySelectorAll('table'))
  const table=tables.find(t=>{
    const txt=String(t.textContent||'').toLowerCase()
    return txt.includes('arrival')&&txt.includes('checkout')&&txt.includes('room')&&txt.includes('checkin')
  })
  if(!table) throw new Error('I could not find the Arrival Report table in the copied page.')
  const trList=Array.from(table.querySelectorAll('tr'))
  let headerIndex=-1
  let headers:string[]=[]
  for(let i=0;i<trList.length;i++){
    const cells=Array.from(trList[i].querySelectorAll('th,td')).map(cell=>cellText(cell).toLowerCase())
    if(cells.some(x=>x==='arrival'||x.startsWith('arrival'))&&cells.some(x=>x==='checkout'||x.startsWith('checkout'))&&cells.some(x=>x.includes('room'))){ headerIndex=i; headers=cells; break }
  }
  if(headerIndex<0) throw new Error('The copied table did not contain the expected Arrival Report columns.')
  const indexOf=(tests:string[])=>headers.findIndex(h=>tests.some(test=>h.includes(test)))
  const idx={arrival:indexOf(['arrival']),checkout:indexOf(['checkout']),address:indexOf(['address']),room:indexOf(['room']),occ:indexOf(['occ']),product:indexOf(['product']),checkin:indexOf(['checkin'])}
  const rows:any[]=[]
  let current:any=null
  for(let i=headerIndex+1;i<trList.length;i++){
    const cells=Array.from(trList[i].querySelectorAll('td'))
    if(!cells.length) continue
    const values=cells.map(cell=>cellText(cell))
    const rowText=values.join(' | ').trim()
    if(!rowText) continue
    const arrival=idx.arrival>=0?isoFromUsDate(values[idx.arrival]||''):null
    const checkout=idx.checkout>=0?isoFromUsDate(values[idx.checkout]||''):null
    if(arrival&&checkout&&idx.room>=0){
      const addressText=values[idx.address]||''
      const addressLines=addressText.split('\n').map(x=>x.trim()).filter(Boolean)
      const guestName=addressLines[0]||''
      const phoneLine=addressLines.find(line=>/^Phone\s*:/i.test(line))||addressLines.find(line=>/^Cell\s*:/i.test(line))||''
      const digits=phoneLine.replace(/\D/g,'').slice(-10)
      const roomText=values[idx.room]||''
      const roomName=roomNames.find(name=>roomText.toLowerCase().includes(name.toLowerCase())) || roomText.split('\n').map(x=>x.trim()).find(Boolean) || null
      const reservationNumber=roomText.match(/order\s*[:#]?\s*(\d{4,8})/i)?.[1]||null
      const escapedRoom=roomName?roomName.replace(/[.*+?^${}()|[\]\\]/g,'\\export default function ReservationSyncBoard(){'):''
      const ratePlan=roomText.replace(escapedRoom?new RegExp(escapedRoom,'i'):/^$/,'').replace(/\(\s*order\s*[:#]?\s*\d{4,8}\s*\)/ig,'').replace(/\s+/g,' ').trim()||null
      const occupancy=Number(String(values[idx.occ]||'').match(/\d+/)?.[0]||0)||null
      const productsRaw=(values[idx.product]||'').trim()||null
      const checkInTime=(values[idx.checkin]||'').replace(/\s+/g,' ').trim()||null
      current={
        reservationKey:reservationNumber?'order:'+reservationNumber:'direct:'+guestName+'|'+roomName+'|'+arrival+'|'+checkout,
        reservationNumber,guestName,phone:null,doorCode:digits?digits.slice(-4):null,arrivalDate:arrival,checkoutDate:checkout,roomName,occupancy,ratePlan,checkInTime,productsRaw,
        dietaryRestrictions:null,referralSource:null,reasonForVisit:null,guestComments:null,innkeeperNotes:null,sourcePage:0,rawText:rowText,confidence:100,
        needsReview:!guestName||!roomName||!reservationNumber||!digits,
        warnings:[...(!guestName?['Guest name missing']:[]),...(!roomName?['Room missing']:[]),...(!reservationNumber?['Reservation number missing']:[]),...(!digits?['Door code could not be derived']:[])]
      }
      rows.push(current)
      continue
    }
    if(current && /dietary restrictions|guest comment|innkeeper notes|reason for your visit|how did you hear/i.test(rowText)){ Object.assign(current,parseNoteText(rowText)); current.rawText += ' '+rowText }
  }
  if(!rows.length) throw new Error('No reservation rows were found in the copied Arrival Report.')
  return rows
}

export default function ReservationSyncBoard(){
  const [file,setFile]=useState<File|null>(null)
  const [sourceName,setSourceName]=useState('Arrival Report')
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
  const [verifyDate,setVerifyDate]=useState(localDate())

  async function loadMeta(date=verifyDate){
    const r=await fetch(`/api/reservation-sync?date=${encodeURIComponent(date)}`,{cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(r.ok){ setRooms(d.rooms||[]); setBatches(d.batches||[]); setVerification(d.verification||null) }
  }

  useEffect(()=>{ void loadMeta(verifyDate) },[verifyDate])

  async function extractPdfLocally(selected:File){
    if(selected.size>12*1024*1024) throw new Error('PDF is too large. Please use an Arrival Report under 12 MB.')
    setProgress('Reading PDF in your browser…'); setPct(5)

    const pdfjs:any=await import('pdfjs-dist/legacy/build/pdf.mjs')
    if(!pdfjs.GlobalWorkerOptions.workerSrc){
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs',import.meta.url).toString()
    }

    const pdf=await pdfjs.getDocument({
      data:new Uint8Array(await selected.arrayBuffer()),
      useWorkerFetch:false,
      isEvalSupported:false,
      useSystemFonts:true
    }).promise

    const pages:string[]=new Array(pdf.numPages)
    const unreadable:number[]=[]
    const concurrency=4

    async function extractEmbeddedText(pageNumber:number){
      const page=await pdf.getPage(pageNumber)
      try{
        const content=await page.getTextContent()
        const positioned=(content.items||[])
          .filter((item:any)=>String(item?.str||'').trim())
          .map((item:any)=>({
            text:String(item?.str||'').trim(),
            x:Number(item?.transform?.[4]||0),
            y:Number(item?.transform?.[5]||0)
          }))
          .sort((a:any,b:any)=>{
            const dy=b.y-a.y
            return Math.abs(dy)>2.2?dy:a.x-b.x
          })

        const rows:{y:number;items:any[]}[]=[]
        let current:{y:number;items:any[]}|null=null
        for(const item of positioned){
          if(!current || Math.abs(current.y-item.y)>2.2){
            current={y:item.y,items:[item]}
            rows.push(current)
          }else current.items.push(item)
        }

        return rows
          .map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' | '))
          .join('\n')
          .trim()
      }finally{
        await page.cleanup?.()
      }
    }

    async function ocrPage(pageNumber:number,worker:any){
      const page=await pdf.getPage(pageNumber)
      try{
        const viewport=page.getViewport({scale:2})
        const canvas=document.createElement('canvas')
        canvas.width=Math.ceil(viewport.width)
        canvas.height=Math.ceil(viewport.height)
        const ctx=canvas.getContext('2d',{willReadFrequently:true})
        if(!ctx) throw new Error('Could not create the local PDF reader canvas.')
        await page.render({canvasContext:ctx,viewport}).promise
        const result=await worker.recognize(canvas,{}, {blocks:true,text:true})
        const blocks=result?.data?.blocks||[]
        const words:any[]=[]
        const collectWords=(node:any)=>{
          if(!node) return
          if(Array.isArray(node)){ node.forEach(collectWords); return }
          if(node.text && node.bbox && typeof node.bbox.x0==='number' && typeof node.bbox.y0==='number' && !node.words){
            words.push({text:String(node.text).trim(),x:Number(node.bbox.x0),y:Number(node.bbox.y0),h:Math.max(1,Number(node.bbox.y1)-Number(node.bbox.y0))})
          }
          if(node.words) collectWords(node.words)
          if(node.lines) collectWords(node.lines)
          if(node.paragraphs) collectWords(node.paragraphs)
          if(node.blocks) collectWords(node.blocks)
        }
        collectWords(blocks)

        if(words.length){
          words.sort((a,b)=>{
            const dy=a.y-b.y
            if(Math.abs(dy)>Math.max(5,Math.min(a.h,b.h)*0.55)) return dy
            return a.x-b.x
          })
          const rows:{y:number;h:number;items:any[]}[]=[]
          let current:{y:number;h:number;items:any[]}|null=null
          for(const word of words){
            const tolerance=Math.max(5,(current?.h||word.h)*0.6)
            if(!current || Math.abs(current.y-word.y)>tolerance){
              current={y:word.y,h:word.h,items:[word]}
              rows.push(current)
            }else{
              current.items.push(word)
              current.h=Math.max(current.h,word.h)
            }
          }
          return rows
            .map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).filter(Boolean).join(' '))
            .join('\n')
            .replace(/\r/g,'')
            .trim()
        }

        return String(result?.data?.text||'').replace(/\r/g,'').trim()
      }finally{
        await page.cleanup?.()
      }
    }

    try{
      for(let start=1;start<=pdf.numPages;start+=concurrency){
        const pageNumbers=Array.from({length:Math.min(concurrency,pdf.numPages-start+1)},(_,index)=>start+index)
        const texts=await Promise.all(pageNumbers.map(extractEmbeddedText))
        pageNumbers.forEach((pageNumber,index)=>{
          const text=texts[index]
          if(text && text.length>=80) pages[pageNumber-1]=text
          else unreadable.push(pageNumber)
        })
        setPct(Math.min(45,Math.round((Math.min(pdf.numPages,start+concurrency-1)/pdf.numPages)*45)))
      }

      if(unreadable.length){
        setProgress(`This report is image-based. Reading ${unreadable.length} page${unreadable.length===1?'':'s'} locally…`)
        const tess:any=await import('tesseract.js')
        const worker=await tess.createWorker('eng')
        try{
          if(worker.setParameters){
            await worker.setParameters({preserve_interword_spaces:'1'})
          }
          for(let index=0;index<unreadable.length;index++){
            const pageNumber=unreadable[index]
            setProgress(`Reading scanned page ${pageNumber} of ${pdf.numPages}…`)
            const text=await ocrPage(pageNumber,worker)
            if(!text || text.length<80) throw new Error(`Page ${pageNumber} could not be read from this report.`)
            pages[pageNumber-1]=text
            setPct(45+Math.round(((index+1)/unreadable.length)*30))
          }
        }finally{
          await worker.terminate()
        }
      }

      return pages
    }finally{
      await pdf.destroy?.()
    }
  }

  async function previewStructured(structured:any[],name='PMS Arrival Report'){
    setBusy(true); setError(''); setSuccess(''); setRows([]); setProgress('Comparing copied PMS data…'); setPct(82)
    try{
      const r=await fetch('/api/reservation-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'previewStructured',reservations:structured,fileName:name})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not preview copied PMS data.')
      setRows(d.reservations||[]); setReportStart(d.reportStartDate||null); setReportEnd(d.reportEndDate||null); setWarnings(d.warnings||[]); setSourceName(name)
      setProgress('Preview ready: '+String((d.reservations||[]).length)+' reservations found.'); setPct(100)
    }catch(e:any){ setError(e?.message||'Could not read the copied PMS report.'); setProgress(''); setPct(0) }
    finally{ setBusy(false) }
  }

  async function pasteFromPms(){
    setError(''); setSuccess('')
    try{
      if(!navigator.clipboard?.read) throw new Error('Clipboard access is unavailable in this browser. Use Chrome or Edge, copy the PMS report page, then try again.')
      const items=await navigator.clipboard.read()
      let html=''
      for(const item of items){ if(!html && item.types.includes('text/html')) html=await (await item.getType('text/html')).text() }
      if(!html) throw new Error('The clipboard does not contain the Arrival Report table as formatted HTML. On the PMS report page, press Cmd+A then Cmd+C and try again.')
      const structured=parsePmsTableHtml(html,rooms.map(room=>room.name))
      await previewStructured(structured,'PMS Arrival Report (copied)')
    }catch(e:any){ setError(e?.message||'Could not paste the PMS Arrival Report.') }
  }

  async function preview(){
    if(!file) return
    setBusy(true); setError(''); setSuccess(''); setRows([])
    try{
      const pages=await extractPdfLocally(file)
      setProgress('Comparing with current reservation data…'); setPct(82)
      const controller=new AbortController()
      const timeout=window.setTimeout(()=>controller.abort(),15000)
      const r=await fetch('/api/reservation-sync',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'preview',pages,fileName:file.name}),
        signal:controller.signal
      })
      window.clearTimeout(timeout)
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not preview this report.')
      setRows(d.reservations||[])
      setReportStart(d.reportStartDate||null)
      setReportEnd(d.reportEndDate||null)
      setWarnings(d.warnings||[])
      setProgress(`Preview ready: ${(d.reservations||[]).length} reservations found.`)
      setPct(100)
    }catch(e:any){
      setError(e?.name==='AbortError'?'The comparison took too long. Please try again.':(e?.message||'Could not read this report.'))
      setProgress('')
      setPct(0)
    }finally{
      setBusy(false)
    }
  }

  function patch(index:number,patch:Partial<PreviewRow>){ setRows(current=>current.map((r,i)=>i===index?{...r,...patch}:r)) }

  async function commit(){
    const selected=rows.filter(r=>r.include)
    if(!selected.length) return
    setBusy(true); setError(''); setSuccess(''); setProgress('Updating reservations and daily room operations…'); setPct(30)
    try{
      const r=await fetch('/api/reservation-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        action:'commit',fileName:sourceName||(file?.name||'Arrival Report.pdf'),reportStartDate:reportStart,reportEndDate:reportEnd,
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
        <p>Copy the live Arrival Report directly from the PMS for the most accurate sync. The app compares reservations with the last import, then updates daily room status and stay information without touching housekeeping progress, assignments, sign-offs or EOS work.</p>
      </div>
      <div className="rs-verify-card">
        <div className="rs-verify-title"><ShieldCheck size={18}/> Daily verification</div>
        <input type="date" value={verifyDate} onChange={e=>setVerifyDate(e.target.value)}/>
        {verification ? <div className="rs-verified"><CheckCircle2 size={16}/> Verified {new Date(verification.verified_at).toLocaleString()}</div> : <button className="rs-btn rs-secondary" onClick={verify} disabled={busy}>Mark day verified</button>}
      </div>
    </section>

    <section className="rs-upload-card">
      <div className="rs-kicker">Recommended · no OCR</div>
      <h2>Copy directly from the PMS Arrival Report</h2>
      <p>On the Arrival Report page, press <strong>Cmd+A</strong> then <strong>Cmd+C</strong>. Come back here and click the button below. The app reads the actual table cells instead of trying to interpret a PDF image.</p>
      <div className="rs-upload-actions">
        <button className="rs-btn" disabled={busy} onClick={pasteFromPms}>{busy?<RefreshCw className="spin" size={17}/>:<ClipboardPaste size={17}/>} Paste copied PMS report</button>
        <span className="rs-private-note">Only reservation fields needed for operations are sent. Full phone numbers are discarded after the 4-digit door code is derived.</span>
      </div>
    </section>

    <section className="rs-upload-card">
      <div className="rs-kicker">Fallback</div>
      <h2>PDF import</h2>
      <label className={`rs-drop ${file?'has-file':''}`}>
        <input type="file" accept="application/pdf,.pdf" onChange={e=>{const chosen=e.target.files?.[0]||null;setFile(chosen);setSourceName(chosen?.name||'Arrival Report');setRows([]);setError('');setSuccess('')}}/>
        <UploadCloud size={34}/>
        <strong>{file?file.name:'Drop the Arrival Report PDF here'}</strong>
        <span>{file?'Ready to read and compare.':'or click to choose the downloaded PDF'}</span>
      </label>
      <div className="rs-upload-actions">
        <button className="rs-btn" disabled={!file||busy} onClick={preview}>{busy?<RefreshCw className="spin" size={17}/>:<FileUp size={17}/>} Read & preview changes</button>
        <span className="rs-private-note">Use this only when copying directly from the PMS is unavailable. Scanned PDFs can require manual review.</span>
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
            <label>Door code<input value={row.doorCode||''} readOnly/></label>
            <label>Occupancy<input type="number" min="1" max="8" value={row.occupancy||''} onChange={e=>patch(index,{occupancy:e.target.value?Number(e.target.value):null})}/></label>
            <label>Check-in<input value={row.checkInTime||''} onChange={e=>patch(index,{checkInTime:e.target.value})}/></label>
            <label className="wide">Rate / booking product<input value={row.ratePlan||''} onChange={e=>patch(index,{ratePlan:e.target.value})}/></label>
            <label className="wide">Packages / products<input value={row.productsRaw||''} onChange={e=>patch(index,{productsRaw:e.target.value})}/></label>
            <label className="wide">Dietary restrictions<input value={row.dietaryRestrictions||''} onChange={e=>patch(index,{dietaryRestrictions:e.target.value})}/></label>
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
