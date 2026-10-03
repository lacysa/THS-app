'use client'

import { useEffect,useMemo,useState } from 'react'
import { RefreshCw, PackagePlus } from 'lucide-react'

type Item={id:string;category:string;item_name:string;supplier:string|null;supplier_sku:string|null;par_level:string|null;order_url:string|null;notes:string|null}
type Req={id:string;item_name:string;requested_qty:string|null;note:string|null;status:string;requested_at:string}

export default function InventoryBoard({department,label}:{department:string;label:string}) {
  const [items,setItems]=useState<Item[]>([])
  const [requests,setRequests]=useState<Req[]>([])
  const [canManage,setCanManage]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [selected,setSelected]=useState('')
  const [quantity,setQuantity]=useState('')
  const [note,setNote]=useState('')
  const [newItem,setNewItem]=useState('')
  const [newCategory,setNewCategory]=useState('General')

  async function load(){
    setLoading(true);setMessage('')
    const r=await fetch(`/api/inventory?department=${encodeURIComponent(department)}`,{cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not load inventory.');setLoading(false);return}
    setItems(d.items||[]);setRequests(d.requests||[]);setCanManage(Boolean(d.canManage));setLoading(false)
  }
  useEffect(()=>{void load()},[department])

  const groups=useMemo(()=>{
    const map=new Map<string,Item[]>()
    for(const item of items){const k=item.category||'General';if(!map.has(k))map.set(k,[]);map.get(k)!.push(item)}
    return [...map.entries()]
  },[items])

  async function requestItem(){
    const item=items.find(i=>i.id===selected)
    if(!item && !newItem.trim()){setMessage('Choose an item or enter another item.');return}
    const r=await fetch('/api/inventory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      action:'request',department,inventoryItemId:item?.id||null,itemName:item?.item_name||newItem.trim(),quantity,note
    })})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not send request.');return}
    setMessage('Order request sent to managers.');setSelected('');setNewItem('');setQuantity('');setNote('');await load()
  }

  async function setStatus(id:string,status:string){
    await fetch('/api/inventory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'status',department,id,status})})
    await load()
  }

  async function addItem(){
    if(!newItem.trim())return
    const r=await fetch('/api/inventory',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'add_item',department,itemName:newItem,category:newCategory})})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not add item.');return}
    setNewItem('');await load()
  }

  return <div className="inventory-page">
    <div className="module-toolbar">
      <div><div className="module-kicker">{label}</div><h1>Inventory</h1><p>Flag stock and ordering needs. Requests alert managers automatically.</p></div>
      <button className="ops-secondary-btn" onClick={load}><RefreshCw size={15}/>Refresh</button>
    </div>
    {message&&<div className="module-message">{message}</div>}

    <section className="card inventory-request-card">
      <h2>Request inventory / order</h2>
      <div className="inventory-request-grid">
        <label>Existing item<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select item</option>{items.map(i=><option key={i.id} value={i.id}>{i.item_name}</option>)}</select></label>
        <label>Or another item<input value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="Item name"/></label>
        <label>Quantity needed<input value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="ex. 1 case"/></label>
        <label className="wide">Note<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Low stock, out, preferred source, urgency…"/></label>
      </div>
      <button className="ops-primary-btn" onClick={requestItem}><PackagePlus size={15}/>Alert managers</button>
    </section>

    <section className="card">
      <h2>Open requests</h2>
      <div className="inventory-request-list">
        {requests.filter(r=>!['received','cancelled'].includes(r.status)).length===0&&<div className="muted">No open requests.</div>}
        {requests.filter(r=>!['received','cancelled'].includes(r.status)).map(r=><div className="inventory-request-row" key={r.id}>
          <div><strong>{r.item_name}</strong><span>{r.requested_qty||'Qty not specified'}{r.note?` · ${r.note}`:''}</span></div>
          <span className="pill">{r.status}</span>
          {canManage&&<div className="inventory-request-actions"><button onClick={()=>setStatus(r.id,'ordered')}>Ordered</button><button onClick={()=>setStatus(r.id,'received')}>Received</button></div>}
        </div>)}
      </div>
    </section>

    <section className="inventory-catalog">
      {loading?<div className="module-empty">Loading inventory…</div>:groups.map(([category,categoryItems])=><section key={category} className="card"><h2>{category}</h2><div className="inventory-item-grid">{categoryItems.map(i=><div className="inventory-item" key={i.id}><strong>{i.item_name}</strong><span>{[i.supplier,i.supplier_sku&&`#${i.supplier_sku}`,i.par_level&&`Par: ${i.par_level}`].filter(Boolean).join(' · ')||'No sourcing details yet'}</span>{i.order_url&&<a href={i.order_url} target="_blank" rel="noreferrer">Order link</a>}</div>)}</div></section>)}
    </section>

    {canManage&&<section className="card inventory-add-card"><h2>Add inventory item</h2><div className="inventory-request-grid"><label>Category<input value={newCategory} onChange={e=>setNewCategory(e.target.value)}/></label><label>Item<input value={newItem} onChange={e=>setNewItem(e.target.value)}/></label></div><button className="ops-secondary-btn" onClick={addItem}>Add item</button></section>}
  </div>
}
