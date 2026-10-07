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
  sourceSection?:'stayover'|'reservation'
  allowMissingDoorCode?:boolean
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

function allUsDates(value:string){
  const matches=String(value||'').match(/\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}/g)||[]
  return matches.map(isoFromUsDate).filter(Boolean) as string[]
}

function normalizeRoomKey(value:string){
  return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
}

function findRoomSegments(roomText:string,roomNames:string[]){
  const lower=String(roomText||'').toLowerCase()
  const hits=roomNames
    .map(name=>({name,index:lower.indexOf(name.toLowerCase())}))
    .filter(hit=>hit.index>=0)
    .sort((a,b)=>a.index-b.index)

  return hits.map((hit,index)=>{
    const next=hits[index+1]?.index ?? roomText.length
    const segment=roomText.slice(hit.index,next).trim()
    return {roomName:hit.name,segment}
  })
}

function headerSchema(cells:string[]){
  const lower=cells.map(value=>value.toLowerCase().replace(/\s+/g,' ').trim())
  const room=lower.findIndex(value=>value.includes('room'))
  const address=lower.findIndex(value=>value.includes('address'))
  if(room<0||address<0) return null

  const combined=lower.findIndex(value=>value.includes('arrival')&&value.includes('checkout'))
  const arrival=lower.findIndex(value=>value.includes('arrival')&&!value.includes('checkout'))
  const checkout=lower.findIndex(value=>value.includes('checkout')&&!value.includes('arrival'))
  const stayover=lower.findIndex(value=>value.includes('stay-over')||value.includes('stayover'))
  if(combined<0&&arrival<0&&checkout<0&&stayover<0) return null

  return {
    combined,
    arrival,
    checkout,
    stayover,
    address,
    room,
    occ:lower.findIndex(value=>value.includes('occ')),
    product:lower.findIndex(value=>value.includes('product')),
    checkin:lower.findIndex(value=>value.includes('checkin'))
  }
}

function parsePmsTableHtml(html:string,roomNames:string[]){
  const doc=new DOMParser().parseFromString(html,'text/html')
  const tables=Array.from(doc.querySelectorAll('table'))
  const rows:any[]=[]
  let foundReportTable=false

  for(const table of tables){
    const trList=Array.from(table.querySelectorAll('tr'))
    let schema:any=null
    let currentRows:any[]=[]

    for(const tr of trList){
      const cells=Array.from(tr.querySelectorAll('th,td'))
      if(!cells.length) continue
      const values=cells.map(cell=>cellText(cell))
      const rowText=values.join(' | ').trim()
      if(!rowText) continue

      const possibleHeader=headerSchema(values)
      if(possibleHeader){
        schema=possibleHeader
        foundReportTable=true
        currentRows=[]
        continue
      }

      if(!schema) continue
      if(/total\s+(arrival|checkout|stay-?over)\s+guests/i.test(rowText)) continue

      let arrival:string|null=null
      let checkout:string|null=null

      if(schema.combined>=0){
        const dates=allUsDates(values[schema.combined]||'')
        arrival=dates[0]||null
        checkout=dates[1]||null
      }else{
        if(schema.arrival>=0) arrival=isoFromUsDate(values[schema.arrival]||'')
        if(schema.checkout>=0) checkout=isoFromUsDate(values[schema.checkout]||'')
      }

      if((!arrival||!checkout) && schema.stayover>=0){
        const allDates=values.flatMap(value=>allUsDates(value))
        const unique=[...new Set(allDates)]
        if(unique.length>=3){
          arrival=unique[1]||arrival
          checkout=unique[2]||checkout
        }else if(unique.length>=2){
          arrival=unique[0]||arrival
          checkout=unique[1]||checkout
        }
      }

      const roomText=schema.room>=0?(values[schema.room]||''):''
      const roomSegments=findRoomSegments(roomText,roomNames)

      if(arrival&&checkout&&roomSegments.length){
        const addressText=values[schema.address]||''
        const addressLines=addressText.split('\n').map(x=>x.trim()).filter(Boolean)
        const guestName=addressLines[0]||''
        const phoneLine=addressLines.find(line=>/^Phone\s*:/i.test(line))||addressLines.find(line=>/^Cell\s*:/i.test(line))||''
        const digits=phoneLine.replace(/\D/g,'').slice(-10)
        const reservationNumber=roomText.match(/order\s*[:#]?\s*(\d{4,8})/i)?.[1]||null
        const occupancy=Number(String(values[schema.occ]||'').match(/\d+/)?.[0]||0)||null
        const sharedProducts=(schema.product>=0?(values[schema.product]||'').trim():'')||null
        const checkInTime=(schema.checkin>=0?(values[schema.checkin]||'').replace(/\s+/g,' ').trim():'')||null
        const isMultiRoom=roomSegments.length>1

        currentRows=roomSegments.map(({roomName,segment},segmentIndex)=>{
          const escapedRoom=roomName.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&')
          const ratePlan=segment
            .replace(new RegExp(escapedRoom,'i'),'')
            .replace(/\(\s*order\s*[:#]?\s*\d{4,8}\s*\)/ig,'')
            .replace(/\s+/g,' ')
            .trim()||null

          const warnings:string[]=[]
          if(!guestName) warnings.push('Guest name missing')
          if(!reservationNumber) warnings.push('Reservation number missing')
          if(!digits) warnings.push('Door code could not be derived')
          if(isMultiRoom) warnings.push('Multi-room reservation split into separate room stays')
          if(isMultiRoom&&sharedProducts) warnings.push('Multi-room booking has shared products; confirm package assignment')

          const productsRaw=isMultiRoom&&sharedProducts ? null : sharedProducts
          const needsReview=!guestName||!roomName||!reservationNumber||!digits||(isMultiRoom&&Boolean(sharedProducts))
          const keyBase=reservationNumber
            ? 'order:'+reservationNumber
            : 'direct:'+guestName+'|'+arrival+'|'+checkout

          return {
            reservationKey:keyBase+'|room:'+normalizeRoomKey(roomName),
            reservationNumber,
            guestName,
            phone:null,
            doorCode:digits?digits.slice(-4):null,
            arrivalDate:arrival,
            checkoutDate:checkout,
            roomName,
            occupancy:isMultiRoom?null:occupancy,
            ratePlan,
            checkInTime,
            productsRaw,
            dietaryRestrictions:null,
            referralSource:null,
            reasonForVisit:null,
            guestComments:null,
            innkeeperNotes:null,
            sourcePage:0,
            rawText:rowText,
            confidence:100,
            needsReview,
            warnings,
            sourceSection:schema.stayover>=0?'stayover':'reservation',
            roomSegmentIndex:segmentIndex
          }
        })

        rows.push(...currentRows)
        continue
      }

      if(currentRows.length && /dietary restrictions|guest comment|innkeeper notes|reason for your visit|how did you hear/i.test(rowText)){
        const notes=parseNoteText(rowText)
        currentRows.forEach(current=>{
          Object.assign(current,notes)
          current.rawText += ' '+rowText
        })
      }
    }
  }

  if(!foundReportTable) throw new Error('I could not find the Arrival Report table in the copied page.')
  if(!rows.length) throw new Error('No reservation rows were found in the copied Arrival Report.')

  const byKey=new Map<string,any>()
  for(const row of rows){
    const key=String(row.reservationKey||'')
    const existing=byKey.get(key)
    if(!existing){
      byKey.set(key,row)
      continue
    }

    const score=(value:any)=>
      Number(Boolean(value.guestName))+
      Number(Boolean(value.doorCode))+
      Number(Boolean(value.ratePlan))+
      Number(Boolean(value.checkInTime))+
      Number(Boolean(value.productsRaw))+
      Number(Boolean(value.dietaryRestrictions))+
      Number(Boolean(value.guestComments))+
      Number(Boolean(value.innkeeperNotes))

    if(score(row)>score(existing)) byKey.set(key,{...existing,...row})
  }

  return [...byKey.values()]
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

  function setDoorCode(index:number,value:string){
    const digits=String(value||'').replace(/\D/g,'').slice(-4)
    setRows(current=>current.map((row,i)=>{
      if(i!==index) return row
      const otherWarnings=(row.warnings||[]).filter(w=>!/door code/i.test(w))
      const warnings=digits.length===4
        ? otherWarnings
        : [...otherWarnings,'Door code must be 4 digits or bypassed']
      const needsReview=warnings.length>0
      return {
        ...row,
        doorCode:digits||null,
        allowMissingDoorCode:false,
        warnings,
        needsReview,
        include:needsReview?false:row.include
      }
    }))
  }

  function setDoorCodeBypass(index:number,bypassed:boolean){
    setRows(current=>current.map((row,i)=>{
      if(i!==index) return row
      const otherWarnings=(row.warnings||[]).filter(w=>!/door code/i.test(w))
      const hasValidCode=String(row.doorCode||'').replace(/\D/g,'').length===4
      const warnings=bypassed||hasValidCode
        ? otherWarnings
        : [...otherWarnings,'Door code could not be derived']
      const needsReview=warnings.length>0
      return {
        ...row,
        allowMissingDoorCode:bypassed,
        warnings,
        needsReview,
        include:needsReview?false:true
      }
    }))
  }

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
    total:rows.length,
    newCount:rows.filter(r=>r.changeType==='new').length,
    updated:rows.filter(r=>r.changeType==='updated').length,
    stayovers:rows.filter(r=>r.sourceSection==='stayover').length,
    review:rows.filter(r=>r.needsReview).length,
    selected:rows.filter(r=>r.include).length
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
      {progress && <div className="rs-progress"><div><span style={{width:`${pct}%`}}/></div><small>{progress}</small></div>}
      {error && <div className="rs-alert error"><TriangleAlert size={17}/>{error}</div>}
      {success && <div className="rs-alert success"><CheckCircle2 size={17}/>{success}</div>}
    </section>

    {rows.length>0 && <>
      <section className="rs-stats">
        <div><span>Total found</span><strong>{stats.total}</strong></div>
        <div><span>Stayovers found</span><strong>{stats.stayovers}</strong></div>
        <div><span>New</span><strong>{stats.newCount}</strong></div>
        <div><span>Changed</span><strong>{stats.updated}</strong></div>
        <div><span>Needs review</span><strong>{stats.review}</strong></div>
      </section>
      {warnings.length>0 && <div className="rs-alert warning"><TriangleAlert size={17}/><div>{warnings.map(w=><div key={w}>{w}</div>)}</div></div>}
      <section className="rs-review-head">
        <div><h2>Review before import</h2><p>Rows that need review are left unchecked. Fix them, then include them when they are accurate.</p></div>
        <button className="rs-btn" disabled={busy||stats.selected===0} onClick={commit}>Import {stats.selected} selected</button>
      </section>
      <section className="rs-reservations">
        {rows.map((row,index)=><article className={`rs-reservation ${row.needsReview?'needs-review':''}`} key={`${row.reservationKey}-${index}`}>
          <div className="rs-row-top">
            <label className="rs-include"><input type="checkbox" checked={row.include} onChange={e=>patch(index,{include:e.target.checked})}/> Include</label>
            <span className={`rs-change ${row.changeType}`}>{row.changeType}</span>
            {row.sourceSection==='stayover' && <span className="rs-change unchanged">stayover</span>}
            <span className="rs-confidence">{row.sourceSection==='stayover'?'PMS stay-over section':'PMS report'} · {Math.round(row.confidence)}% read confidence</span>
          </div>
          {row.warnings?.length>0 && <div className="rs-row-warning">{row.warnings.join(' · ')}</div>}
          <div className="rs-fields">
            <label>Guest<input value={row.guestName||''} onChange={e=>patch(index,{guestName:e.target.value})}/></label>
            <label>Room<select value={row.roomName||''} onChange={e=>patch(index,{roomName:e.target.value||null})}><option value="">Choose room</option>{rooms.map(room=><option key={room.id}>{room.name}</option>)}</select></label>
            <label>Arrival<input type="date" value={row.arrivalDate||''} onChange={e=>patch(index,{arrivalDate:e.target.value||null})}/></label>
            <label>Checkout<input type="date" value={row.checkoutDate||''} onChange={e=>patch(index,{checkoutDate:e.target.value||null})}/></label>
            <label className="rs-door-code-field">
              Door code
              <input
                inputMode="numeric"
                maxLength={4}
                placeholder={row.allowMissingDoorCode?'No code required':'4 digits'}
                value={row.doorCode||''}
                disabled={Boolean(row.allowMissingDoorCode)}
                onChange={e=>setDoorCode(index,e.target.value)}
              />
              <span className="rs-door-code-help">Enter a 4-digit code, or bypass if the PMS has no phone number.</span>
            </label>
            <label className={`rs-door-bypass ${row.allowMissingDoorCode?'active':''}`}>
              <input
                type="checkbox"
                checked={Boolean(row.allowMissingDoorCode)}
                onChange={e=>setDoorCodeBypass(index,e.target.checked)}
              />
              <span className="rs-door-bypass-switch" aria-hidden="true"><i/></span>
              <span><strong>Bypass door code</strong><small>Import this reservation without a code</small></span>
            </label>
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
