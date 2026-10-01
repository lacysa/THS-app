'use client'

import { useEffect, useMemo, useState } from 'react'

type Option = {
  id:string
  category:string
  label:string
  description:string|null
  active:boolean
  sort_order:number
  show_for_entree:string[]
  blocked_by_dietary:string[]
}

const categoryLabels:Record<string,string> = {
  dietary:'Dietary restrictions',
  entree:'Entrées',
  meat:'Meat choices',
  eggs:'Egg choices',
  coffee:'Coffee',
  cream:'Cream',
  juice:'Juice',
  condiments:'Condiments'
}

export default function MenuManager() {
  const [options,setOptions] = useState<Option[]>([])
  const [loading,setLoading] = useState(true)
  const [message,setMessage] = useState('')
  const [newItem,setNewItem] = useState({category:'entree',label:'',description:'',sortOrder:100,showForEntree:'',blockedByDietary:''})

  async function load() {
    setLoading(true)
    const r = await fetch('/api/staff/menu-options',{cache:'no-store'})
    const json = await r.json().catch(()=>({}))
    if (r.ok) setOptions(json.options || [])
    else setMessage(json.message || 'Could not load menu options.')
    setLoading(false)
  }

  useEffect(()=>{load()},[])

  const grouped = useMemo(()=>{
    const m = new Map<string,Option[]>()
    for (const o of options) {
      const arr = m.get(o.category) || []
      arr.push(o); m.set(o.category,arr)
    }
    return m
  },[options])

  async function patch(id:string,changes:Partial<Option>) {
    setMessage('')
    const r = await fetch('/api/staff/menu-options',{
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...changes})
    })
    const json = await r.json().catch(()=>({}))
    if (!r.ok) return setMessage(json.message || 'Could not save menu option.')
    setOptions(prev=>prev.map(o=>o.id===id?json.option:o))
  }

  async function add() {
    if (!newItem.label.trim()) return setMessage('Enter a menu item name first.')
    const r = await fetch('/api/staff/menu-options',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        category:newItem.category,
        label:newItem.label,
        description:newItem.description || null,
        sortOrder:Number(newItem.sortOrder)||100,
        showForEntree:newItem.showForEntree.split(',').map(x=>x.trim()).filter(Boolean),
        blockedByDietary:newItem.blockedByDietary.split(',').map(x=>x.trim()).filter(Boolean)
      })
    })
    const json = await r.json().catch(()=>({}))
    if (!r.ok) return setMessage(json.message || 'Could not add menu option.')
    setNewItem({...newItem,label:'',description:'',showForEntree:'',blockedByDietary:''})
    await load()
  }

  if (loading) return <div className="card">Loading breakfast menu…</div>

  return (
    <div className="grid" style={{gap:18}}>
      {message && <div className="notice error">{message}</div>}

      <div className="card">
        <h2>Add menu option</h2>
        <div className="grid grid-2">
          <div className="field"><label>Category</label><select value={newItem.category} onChange={e=>setNewItem({...newItem,category:e.target.value})}>{Object.entries(categoryLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field"><label>Menu item</label><input value={newItem.label} onChange={e=>setNewItem({...newItem,label:e.target.value})} placeholder="Example: Blueberry Pancakes"/></div>
          <div className="field"><label>Description</label><input value={newItem.description} onChange={e=>setNewItem({...newItem,description:e.target.value})} placeholder="Optional"/></div>
          <div className="field"><label>Show only for entrée</label><input value={newItem.showForEntree} onChange={e=>setNewItem({...newItem,showForEntree:e.target.value})} placeholder="Optional, comma separated"/></div>
          <div className="field"><label>Hide for dietary restriction</label><input value={newItem.blockedByDietary} onChange={e=>setNewItem({...newItem,blockedByDietary:e.target.value})} placeholder="Optional, comma separated"/></div>
        </div>
        <button className="btn sage" style={{marginTop:14}} onClick={add}>Add to menu</button>
      </div>

      {Object.keys(categoryLabels).map(category=>{
        const rows = grouped.get(category) || []
        return (
          <div className="card" key={category}>
            <h2>{categoryLabels[category]}</h2>
            {rows.length===0 ? <div className="muted">No options yet.</div> : (
              <div style={{overflowX:'auto'}}>
                <table className="menu-admin-table">
                  <thead><tr><th>Active</th><th>Item</th><th>Description</th><th>Order</th><th>Only for entrée</th><th>Hide for dietary</th></tr></thead>
                  <tbody>
                    {rows.map(o=>(
                      <tr key={o.id}>
                        <td><input style={{width:'auto'}} type="checkbox" checked={o.active} onChange={e=>patch(o.id,{active:e.target.checked})}/></td>
                        <td><input defaultValue={o.label} onBlur={e=>e.target.value!==o.label && patch(o.id,{label:e.target.value})}/></td>
                        <td><input defaultValue={o.description || ''} onBlur={e=>e.target.value!==(o.description||'') && patch(o.id,{description:e.target.value})}/></td>
                        <td><input type="number" defaultValue={o.sort_order} style={{width:90}} onBlur={e=>Number(e.target.value)!==o.sort_order && patch(o.id,{sort_order:Number(e.target.value)})}/></td>
                        <td><input defaultValue={(o.show_for_entree||[]).join(', ')} onBlur={e=>{
                          const next=e.target.value.split(',').map(x=>x.trim()).filter(Boolean)
                          if (next.join('|')!==(o.show_for_entree||[]).join('|')) patch(o.id,{show_for_entree:next})
                        }}/></td>
                        <td><input defaultValue={(o.blocked_by_dietary||[]).join(', ')} onBlur={e=>{
                          const next=e.target.value.split(',').map(x=>x.trim()).filter(Boolean)
                          if (next.join('|')!==(o.blocked_by_dietary||[]).join('|')) patch(o.id,{blocked_by_dietary:next})
                        }}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
