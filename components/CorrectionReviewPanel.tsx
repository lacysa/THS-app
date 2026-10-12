'use client'

import { useEffect,useMemo,useState } from 'react'
import { CheckCircle2,ChevronDown,ChevronRight,Clock3,Filter,History,Plus,Save } from 'lucide-react'

type Correction={
  id:string;serviceDate:string;roomName:string;housekeeperName:string|null;assignedTo:string|null
  note:string;categories:string[];resolved:boolean;reviewedAt:string|null;reviewedBy:string|null
}
type HistoryRow={id:string;categories:string[];previousCategories:string[];reviewedAt:string|null;changedAt:string;changedBy:string}

const DEFAULT_CATEGORIES=[
  'Glassware & mirrors: spots / streaks','Glassware & mirrors: polishing',
  'Missing amenities & supplies','Sink / kitchenette: water left',
  'Cleaning / surface debris','Bed & linens','Bathroom cleaning',
  'Maintenance / damage','Other / review'
]

function readableDate(value:string){
  const date=new Date(value.length===10?value+'T12:00:00':value)
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(date)
}

export default function CorrectionReviewPanel({corrections,categorySummary,onSaved}:{
  corrections:Correction[];categorySummary:{category:string;count:number}[];onSaved:()=>void|Promise<void>
}){
  const [category,setCategory]=useState<string|null>(null)
  const [unreviewedOnly,setUnreviewedOnly]=useState(false)
  const [openId,setOpenId]=useState<string|null>(null)
  const [selected,setSelected]=useState<string[]>([])
  const [custom,setCustom]=useState('')
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [historyId,setHistoryId]=useState<string|null>(null)
  const [history,setHistory]=useState<HistoryRow[]>([])
  const [historyLoading,setHistoryLoading]=useState(false)

  const available=useMemo(()=>[...new Set([...DEFAULT_CATEGORIES,...categorySummary.map(c=>c.category),...corrections.flatMap(c=>c.categories),...selected])].sort((a,b)=>a.localeCompare(b)),[corrections,categorySummary,selected])
  const filtered=useMemo(()=>corrections.filter(c=>
    (!category||c.categories.includes(category))&&(!unreviewedOnly||!c.reviewedAt)
  ),[corrections,category,unreviewedOnly])
  const unreviewedCount=corrections.filter(c=>!c.reviewedAt).length

  // The selected correction stays in place when the latest manager data arrives.
  useEffect(()=>{
    if(openId&&!corrections.some(c=>c.id===openId))setOpenId(null)
  },[corrections,openId])

  function toggle(item:Correction){
    setNotice('')
    setHistoryId(null)
    if(openId===item.id){setOpenId(null);return}
    setOpenId(item.id)
    setSelected([...item.categories])
    setCustom('')
  }

  function toggleCategory(value:string){
    setNotice('')
    setSelected(current=>current.includes(value)?current.filter(c=>c!==value):[...current,value])
  }

  function addCategory(){
    const value=custom.trim().replace(/\s+/g,' ')
    if(value.length<2||value.length>80){setNotice('New categories must contain 2–80 characters.');return}
    if(/[\x00-\x1f<>]/.test(value)){setNotice('Please use plain text for the category.');return}
    const existing=available.find(c=>c.toLowerCase()===value.toLowerCase())||selected.find(c=>c.toLowerCase()===value.toLowerCase())
    setSelected(current=>current.includes(existing||value)?current:[...current,existing||value])
    setCustom('')
    setNotice('')
  }

  async function save(item:Correction,markReviewed:boolean){
    if(!selected.length){setNotice('Select at least one category before saving.');return}
    if(selected.length>8){setNotice('Please select no more than eight categories.');return}
    setSaving(true);setNotice('')
    try{
      const response=await fetch('/api/housekeeping/quality',{method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({correctionId:item.id,categories:selected,action:markReviewed?'review':'save'})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not save the correction review.')
      setNotice(markReviewed?'Reviewed and saved. Original note preserved.':'Categories saved. Still awaiting review.')
      await onSaved()
    }catch(error:any){
      setNotice(error?.message||'Could not save the correction review.')
    }finally{setSaving(false)}
  }

  async function loadHistory(item:Correction){
    if(historyId===item.id){setHistoryId(null);return}
    setHistoryId(item.id);setHistory([]);setHistoryLoading(true);setNotice('')
    try{
      const response=await fetch('/api/housekeeping/quality?history='+encodeURIComponent(item.id),{cache:'no-store'})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not retrieve history.')
      setHistory(result.history||[])
    }catch(error:any){setNotice(error?.message||'Could not retrieve history.')}
    finally{setHistoryLoading(false)}
  }

  return <>
    <section className="quality-card">
      <div className="quality-card-head">
        <div><Filter size={17}/><span><strong>Recurring correction categories</strong>
          <small>Tap a category to inspect its corrections. One note may have multiple issues.</small></span></div>
      </div>
      {categorySummary.length?<div className="quality-miss-list">
        {categorySummary.map((item,index)=>{
          const active=category===item.category
          const max=Math.max(1,categorySummary[0]?.count||1)
          return <button type="button" key={item.category} aria-pressed={active}
            className={'quality-miss-row quality-category-button'+(active?' active':'')}
            onClick={()=>{setCategory(active?null:item.category);setOpenId(null);setNotice('')}}>
            <span className="rank">{index+1}</span>
            <span className="quality-category-main"><strong>{item.category}</strong>
              <i><b style={{width:Math.max(4,(item.count/max)*100)+'%'}}/></i>
            </span>
            <strong>{item.count}</strong>
          </button>
        })}</div>:<div className="quality-empty-chart">No classified corrections in this date range.</div>}
    </section>

    <section className="quality-card quality-corrections-card">
      <div className="quality-card-head">
        <div><CheckCircle2 size={17}/><span><strong>Documented room corrections</strong>
          <small>Original Room Operations notes remain unchanged. Reviewing only classifies each correction.</small></span></div>
        <strong>{filtered.length}{filtered.length!==corrections.length?' / '+corrections.length:''}</strong>
      </div>
      <div className="quality-filter-bar">
        <button type="button" onClick={()=>{setCategory(null);setUnreviewedOnly(false);setOpenId(null)}} className={!category&&!unreviewedOnly?'active':''}>All corrections</button>
        <button type="button" onClick={()=>{setUnreviewedOnly(v=>!v);setOpenId(null)}} className={unreviewedOnly?'active':''} aria-pressed={unreviewedOnly}>
          Needs review ({unreviewedCount})</button>
        {category&&<button type="button" className="quality-filter-selected" onClick={()=>{setCategory(null);setOpenId(null)}}>Category: {category} ×</button>}
      </div>
      {!filtered.length?<div className="quality-empty-chart">No corrections match these filters.</div>:
        <div className="quality-correction-list">{filtered.map(item=>{
          const expanded=openId===item.id
          return <article className={'quality-correction-item'+(expanded?' expanded':'')} key={item.id}>
            <button type="button" className="quality-correction-summary" aria-expanded={expanded} onClick={()=>toggle(item)}>
              <span className="quality-correction-content">
                <strong>{item.housekeeperName||('Unattributed'+(item.assignedTo?' (assigned: '+item.assignedTo+')':''))} · {item.roomName}</strong>
                <small>{readableDate(item.serviceDate)} · {item.resolved?'Marked fixed':'Correction reported'}</small>
                <span className="quality-note">{item.note}</span>
                <span className="quality-category-pills">{item.categories.map(c=><span key={c}>{c}</span>)}</span>
                <small className={'quality-review-status'+(item.reviewedAt?' reviewed':'')}>{item.reviewedAt?'Reviewed by '+(item.reviewedBy||'manager')+' · '+readableDate(item.reviewedAt):'Needs category review'}</small>
              </span>
              {expanded?<ChevronDown size={18}/>:<ChevronRight size={18}/>}
            </button>
            {expanded&&<div className="quality-correction-editor">
              <strong>Classify this correction</strong>
              <p>Choose all applicable categories, or add a new one. The original note, room, and housekeeper are never changed.</p>
              <div className="quality-category-choices">{available.map(value=>
                <label className={'quality-category-choice'+(selected.includes(value)?' active':'')} key={value}>
                  <input className="quality-review-checkbox" type="checkbox" checked={selected.includes(value)} onChange={()=>toggleCategory(value)}/><span className="quality-category-choice-text">{value}</span>
                </label>)}</div>
              <div className="quality-add-category">
                <input aria-label="New correction category" placeholder="New category, e.g. Glassware polishing" maxLength={80}
                  value={custom} onChange={e=>setCustom(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCategory()}}}/>
                <button type="button" onClick={addCategory} disabled={!custom.trim()}><Plus size={15}/> Add</button>
              </div>
              <div className="quality-review-actions">
                <button type="button" className="quality-review-save" onClick={()=>save(item,false)} disabled={saving||!selected.length}><Save size={15}/> Save categories</button>
                <button type="button" className="quality-review-confirm" onClick={()=>save(item,true)} disabled={saving||!selected.length}><CheckCircle2 size={15}/> {saving?'Saving…':'Save & mark reviewed'}</button>
                <button type="button" className="quality-review-history" onClick={()=>loadHistory(item)} disabled={historyLoading}><History size={15}/> {historyId===item.id?'Hide history':'History'}</button>
              </div>
              {notice&&<p className="quality-review-notice" role="status">{notice}</p>}
              {historyId===item.id&&<div className="quality-review-timeline">
                <strong><Clock3 size={14}/> Review history</strong>
                {historyLoading?<p>Loading history…</p>:history.length?history.map(row=>
                  <div key={row.id}><small>{row.changedBy} · {readableDate(row.changedAt)} · {row.reviewedAt?'Marked reviewed':'Category update'}</small>
                    <span>{row.categories.join(' · ')}</span></div>):<p>No prior reviews for this correction.</p>}
              </div>}
            </div>}
          </article>
        })}</div>}
    </section>
  </>
}
