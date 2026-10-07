'use client'

import { useEffect,useMemo,useState } from 'react'
import { AlertTriangle,BarChart3,CheckCircle2,RefreshCw,ShieldCheck,Users } from 'lucide-react'

type Miss={itemId:string;label:string;zone:string;count:number}
type Individual={
  housekeeperId:string
  name:string
  roomsInspected:number
  firstPasses:number
  firstPassRate:number
  discrepancies:number
  missesPer100Rooms:number
  unresolved:number
  commonMisses:Miss[]
}
type Weekly={week:string;inspections:number;passes:number;discrepancies:number;firstPassRate:number}
type Data={
  range:{days:number;start:string;end:string}
  department:{
    roomsInspected:number
    firstPasses:number
    firstPassRate:number
    discrepancies:number
    missesPer100Rooms:number
    rechecks:number
    unresolved:number
    averageCorrectionMinutes:number|null
  }
  weekly:Weekly[]
  individuals:Individual[]
  commonMisses:Miss[]
}

function shortDate(value:string){
  const d=new Date(value+'T12:00:00')
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(d)
}

function rateLabel(value:number){
  return Number.isFinite(value)?value.toFixed(1)+'%':'0.0%'
}

function TrendChart({rows}:{rows:Weekly[]}){
  const points=useMemo(()=>{
    if(!rows.length) return ''
    const width=100
    const height=34
    const step=rows.length===1?0:width/(rows.length-1)
    return rows.map((row,index)=>{
      const x=rows.length===1?50:index*step
      const y=height-(Math.max(0,Math.min(100,row.firstPassRate))/100)*height
      return x.toFixed(2)+','+y.toFixed(2)
    }).join(' ')
  },[rows])

  if(!rows.length) return <div className="quality-empty-chart">No completed inspections in this range yet.</div>

  return <div className="quality-trend-wrap">
    <div className="quality-chart-y"><span>100%</span><span>50%</span><span>0%</span></div>
    <div className="quality-trend-main">
      <svg className="quality-trend-svg" viewBox="0 0 100 34" preserveAspectRatio="none" role="img" aria-label="Housekeeping first-pass rate trend">
        <line x1="0" x2="100" y1="0" y2="0"/>
        <line x1="0" x2="100" y1="17" y2="17"/>
        <line x1="0" x2="100" y1="34" y2="34"/>
        <polyline points={points}/>
      </svg>
      <div className="quality-trend-labels">
        {rows.map(row=><span key={row.week}>{shortDate(row.week)}</span>)}
      </div>
    </div>
  </div>
}

export default function HousekeepingQualityDashboard(){
  const [days,setDays]=useState(30)
  const [data,setData]=useState<Data|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  async function load(){
    setLoading(true);setError('')
    try{
      const r=await fetch('/api/housekeeping/quality?days='+days,{cache:'no-store'})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not load housekeeping quality trends.')
      setData(d)
    }catch(e:any){
      setError(e?.message||'Could not load housekeeping quality trends.')
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[days])

  return <div className="quality-page module-pretty-page">
    <section className="module-pretty-hero quality-hero">
      <div>
        <div className="module-kicker">Manager view only</div>
        <h1>Housekeeping Quality</h1>
        <p>First-pass room quality, recurring misses, re-checks, and documented inspection trends.</p>
      </div>
      <div className="quality-range">
        {[30,60,90].map(value=><button key={value} className={days===value?'active':''} onClick={()=>setDays(value)}>{value} days</button>)}
        <button aria-label="Refresh quality data" onClick={()=>void load()}><RefreshCw size={15}/></button>
      </div>
    </section>

    {error&&<div className="module-message"><AlertTriangle size={15}/>{error}</div>}
    {loading||!data ? <div className="module-empty">Loading quality trends…</div> : <>
      <section className="quality-metrics">
        <div><span>Rooms inspected</span><strong>{data.department.roomsInspected}</strong><small>Sample size</small></div>
        <div><span>First-pass rate</span><strong>{rateLabel(data.department.firstPassRate)}</strong><small>{data.department.firstPasses} passed first inspection</small></div>
        <div><span>Checklist discrepancies</span><strong>{data.department.discrepancies}</strong><small>{data.department.missesPer100Rooms} per 100 inspected rooms</small></div>
        <div><span>Open corrections</span><strong>{data.department.unresolved}</strong><small>{data.department.rechecks} re-checks completed</small></div>
      </section>

      <section className="quality-grid-two">
        <article className="quality-card quality-trend-card">
          <div className="quality-card-head">
            <div><ShieldCheck size={17}/><span><strong>Housekeeping overall</strong><small>Weekly first-pass inspection rate</small></span></div>
            <strong>{rateLabel(data.department.firstPassRate)}</strong>
          </div>
          <TrendChart rows={data.weekly}/>
          <div className="quality-chart-foot">Always read the rate with the inspection count. Small samples can swing sharply.</div>
        </article>

        <article className="quality-card">
          <div className="quality-card-head">
            <div><BarChart3 size={17}/><span><strong>Most common misses</strong><small>All housekeeping discrepancies</small></span></div>
          </div>
          {!data.commonMisses.length?<div className="quality-empty-chart">No discrepancies recorded in this range.</div>:
            <div className="quality-miss-list">{data.commonMisses.slice(0,6).map((miss,index)=>{
              const max=Math.max(1,data.commonMisses[0]?.count||1)
              return <div className="quality-miss-row" key={miss.itemId}>
                <span className="rank">{index+1}</span>
                <div><strong>{miss.label}</strong><small>{miss.zone}</small><i><b style={{width:Math.max(4,(miss.count/max)*100)+'%'}}/></i></div>
                <strong>{miss.count}</strong>
              </div>
            })}</div>}
        </article>
      </section>

      <section className="quality-card">
        <div className="quality-card-head">
          <div><Users size={17}/><span><strong>Individual housekeepers</strong><small>First-pass performance with sample size and documented misses</small></span></div>
        </div>
        {!data.individuals.length?<div className="quality-empty-chart">No housekeeper inspection data has been collected yet.</div>:
          <div className="quality-person-bars">
            {data.individuals.map(person=><div className="quality-person-row" key={person.housekeeperId}>
              <div className="quality-person-name"><strong>{person.name}</strong><small>{person.roomsInspected} inspected · {person.discrepancies} discrepancies</small></div>
              <div className="quality-person-track"><span style={{width:Math.max(person.firstPassRate>0?4:0,person.firstPassRate)+'%'}}/></div>
              <strong className="quality-person-rate">{rateLabel(person.firstPassRate)}</strong>
            </div>)}
          </div>}
      </section>

      <section className="quality-card quality-table-card">
        <div className="quality-card-head">
          <div><CheckCircle2 size={17}/><span><strong>Corrective-action support</strong><small>Concrete rates and recurring checklist items by housekeeper</small></span></div>
        </div>
        <div className="quality-table-wrap">
          <table className="quality-table">
            <thead><tr><th>Housekeeper</th><th>Inspected</th><th>First-pass</th><th>Discrepancies</th><th>Misses / 100 rooms</th><th>Most common misses</th></tr></thead>
            <tbody>{data.individuals.map(person=><tr key={person.housekeeperId}>
              <td><strong>{person.name}</strong></td>
              <td>{person.roomsInspected}</td>
              <td>{rateLabel(person.firstPassRate)}</td>
              <td>{person.discrepancies}{person.unresolved?<small className="quality-open"> · {person.unresolved} open</small>:null}</td>
              <td>{person.missesPer100Rooms}</td>
              <td>{person.commonMisses.length?person.commonMisses.map(m=>m.label+' ×'+m.count).join(' · '):'—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}
  </div>
}
