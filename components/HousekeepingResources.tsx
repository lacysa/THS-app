'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BedDouble, BookOpen, Camera, CheckSquare, PackageOpen, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'

type Guide = {guide_key:string;title:string;content:string}
type Zone = {id:string;scope:'room'|'property';room_id:string|null;name:string;details:string;sort_order:number;rooms?:{name:string;sort_order:number}|null;photos:any[]}
type Room = {id:string;name:string;sort_order:number}

export default function HousekeepingResources() {
  const [tab,setTab] = useState<'rooms'|'manual'|'tote'|'checklist'>('rooms')
  const [rooms,setRooms] = useState<Room[]>([])
  const [zones,setZones] = useState<Zone[]>([])
  const [guides,setGuides] = useState<Guide[]>([])
  const [canManage,setCanManage] = useState(false)
  const [loading,setLoading] = useState(true)
  const [message,setMessage] = useState('')
  const [scope,setScope] = useState<'room'|'property'>('room')
  const [roomId,setRoomId] = useState('')
  const [zoneName,setZoneName] = useState('')
  const [zoneDetails,setZoneDetails] = useState('')

  async function load() {
    setLoading(true); setMessage('')
    try {
      const r = await fetch('/api/housekeeping/resources',{cache:'no-store'})
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not load housekeeping guide.')
      setRooms(d.rooms || []); setZones(d.zones || []); setGuides(d.guides || []); setCanManage(Boolean(d.canManage))
    } catch(e:any) { setMessage(e?.message || 'Could not load housekeeping guide.') }
    finally { setLoading(false) }
  }
  useEffect(()=>{void load()},[])

  function guide(key:string) { return guides.find(g=>g.guide_key===key) || {guide_key:key,title:key,content:''} }
  function updateGuideLocal(key:string,content:string) { setGuides(cur=>cur.map(g=>g.guide_key===key?{...g,content}:g)) }
  async function saveGuide(key:string) {
    const g=guide(key); setMessage('Saving…')
    const r=await fetch('/api/housekeeping/resources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'save_guide',guideKey:key,title:g.title,content:g.content})})
    const d=await r.json().catch(()=>({})); setMessage(r.ok?'Saved.':d.error||'Could not save.')
  }
  async function createZone() {
    const r=await fetch('/api/housekeeping/resources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'create_zone',scope,roomId:scope==='room'?roomId:null,name:zoneName,details:zoneDetails})})
    const d=await r.json().catch(()=>({})); if(!r.ok){setMessage(d.error||'Could not add zone.');return}
    setZoneName('');setZoneDetails('');await load();setMessage('Zone added.')
  }
  async function saveZone(zone:Zone) {
    const r=await fetch('/api/housekeeping/resources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'update_zone',id:zone.id,name:zone.name,details:zone.details,sortOrder:zone.sort_order})})
    const d=await r.json().catch(()=>({}));setMessage(r.ok?'Zone saved.':d.error||'Could not save zone.')
  }
  async function deleteZone(id:string) {
    if(!window.confirm('Delete this housekeeping zone and its photos?')) return
    await fetch('/api/housekeeping/resources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete_zone',id})});await load()
  }
  async function uploadPhoto(zoneId:string,file:File|null,caption:string) {
    if(!file)return
    const form=new FormData();form.set('zoneId',zoneId);form.set('file',file);form.set('caption',caption)
    setMessage('Uploading photo…')
    const r=await fetch('/api/housekeeping/resources/photo',{method:'POST',body:form});const d=await r.json().catch(()=>({}));if(!r.ok){setMessage(d.error||'Upload failed.');return}await load();setMessage('Photo uploaded.')
  }

  const roomGroups = useMemo(()=>{
    const groups:any[] = rooms.map(room=>({key:`room:${room.id}`,label:room.name,sort:room.sort_order,zones:zones.filter(z=>z.room_id===room.id)})).filter(g=>g.zones.length)
    const property = zones.filter(z=>z.scope==='property')
    if(property.length) groups.push({key:'property',label:'Property Zones',sort:999,zones:property})
    return groups.sort((a,b)=>a.sort-b.sort)
  },[rooms,zones])

  const tabs=[['rooms','Room & Property Details',BedDouble],['manual','Housekeeping Manual',BookOpen],['tote','Cleaning Tote',PackageOpen],['checklist','In-room Checklist',CheckSquare]] as const
  return <div className="hsk-resource-page">
    <div className="hsk-resource-topbar">
      <div><div className="module-kicker">Housekeeping</div><h1>Housekeeping Guide</h1><p>Room details, photos, property zones, training material, tote setup, and cleaning checklist.</p></div>
      <div className="toolbar-actions"><Link className="ops-secondary-btn" href="/housekeeping">Daily Board</Link><button className="ops-secondary-btn" onClick={load}><RefreshCw size={15}/>Refresh</button></div>
    </div>
    <div className="hsk-resource-tabs">{tabs.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={15}/><span>{label}</span></button>)}</div>
    {message&&<div className="module-message">{message}</div>}
    {loading?<div className="module-empty">Loading housekeeping guide…</div>:<>
      {tab==='rooms'&&<div className="hsk-zone-layout">
        {canManage&&<section className="hsk-guide-card hsk-add-zone"><h3>Add room/property zone</h3><div className="hsk-zone-form"><label>Type<select value={scope} onChange={e=>setScope(e.target.value as any)}><option value="room">Guest room</option><option value="property">Property zone</option></select></label>{scope==='room'&&<label>Room<select value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">Select room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}<label>Zone name<input value={zoneName} onChange={e=>setZoneName(e.target.value)} placeholder={scope==='room'?'Bathroom / Bed area / Fireplace':'Lobby / Laundry / Patio'} /></label><label className="wide">Details<textarea value={zoneDetails} onChange={e=>setZoneDetails(e.target.value)} placeholder="What belongs here, setup standards, quirks, inspection notes…" /></label></div><button className="ops-primary-btn" onClick={createZone}><Plus size={15}/>Add zone</button></section>}
        {roomGroups.length===0&&<div className="module-empty">No room/property details have been added yet.</div>}
        {roomGroups.map(group=><section key={group.key} className="hsk-room-resource-group"><h2>{group.label}</h2><div className="hsk-zone-grid">{group.zones.map((zone:Zone)=><article className="hsk-guide-card hsk-zone-card" key={zone.id}><div className="hsk-zone-head"><input disabled={!canManage} value={zone.name} onChange={e=>setZones(cur=>cur.map(z=>z.id===zone.id?{...z,name:e.target.value}:z))}/>{canManage&&<button className="icon-danger" onClick={()=>deleteZone(zone.id)} title="Delete zone"><Trash2 size={14}/></button>}</div><textarea disabled={!canManage} value={zone.details||''} onChange={e=>setZones(cur=>cur.map(z=>z.id===zone.id?{...z,details:e.target.value}:z))} placeholder="Zone standards and details" />{canManage&&<button className="ops-secondary-btn" onClick={()=>saveZone(zone)}><Save size={14}/>Save details</button>}<div className="hsk-photo-grid">{(zone.photos||[]).map((photo:any)=><figure key={photo.id}>{photo.url?<img src={photo.url} alt={photo.caption||zone.name}/>:<div className="hsk-photo-placeholder">Photo</div>}{photo.caption&&<figcaption>{photo.caption}</figcaption>}</figure>)}</div>{canManage&&<PhotoUploader zoneId={zone.id} onUpload={uploadPhoto}/>}</article>)}</div></section>)}
      </div>}
      {(['manual','tote','checklist'] as const).includes(tab as any)&&<GuideEditor key={tab} item={guide(tab)} editable={canManage} onChange={value=>updateGuideLocal(tab,value)} onSave={()=>saveGuide(tab)}/>} 
    </>}
  </div>
}

function PhotoUploader({zoneId,onUpload}:{zoneId:string;onUpload:(zoneId:string,file:File|null,caption:string)=>void}) {
  const [file,setFile]=useState<File|null>(null);const [caption,setCaption]=useState('')
  return <div className="hsk-photo-upload"><label><Camera size={14}/> Add photo<input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><input value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Caption (optional)"/><button className="ops-secondary-btn" disabled={!file} onClick={()=>{onUpload(zoneId,file,caption);setFile(null);setCaption('')}}>Upload</button></div>
}

function GuideEditor({item,editable,onChange,onSave}:{item:Guide;editable:boolean;onChange:(v:string)=>void;onSave:()=>void}) {
  return <section className="hsk-guide-card hsk-guide-editor"><div className="hsk-guide-editor-head"><div><h2>{item.title}</h2><p>{item.guide_key==='manual'?'Training standards, procedures, policies, and housekeeping reference material.':item.guide_key==='tote'?'What should be stocked in a standard cleaning tote before entering rooms.':'Step-by-step room cleaning and final inspection checklist.'}</p></div>{editable&&<button className="ops-primary-btn" onClick={onSave}><Save size={14}/>Save</button>}</div><textarea disabled={!editable} value={item.content||''} onChange={e=>onChange(e.target.value)} /></section>
}
