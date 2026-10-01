'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'

type Option = {
  id:string
  category:string
  label:string
  description?:string | null
  sort_order:number
  show_for_entree?:string[] | null
  blocked_by_dietary?:string[] | null
}

type GuestOrder = {
  guestNumber:1|2
  dietary:string[]
  dietaryComments:string
  entree:string
  pancakes:string
  meat:string
  eggs:string
  coffee:string
  cream:string
  juice:string
  condiments:string[]
  mealDeclined:boolean
}

type Guest2Choice = 'undecided'|'ordering'|'declined'

const NO_DR = 'No Dietary Restrictions'
const VEGAN = 'Vegan'
const COMMENT_DRS = ['Tree Nuts: Please specify below','Other: Please specify below']

function splitDietary(value:unknown):string[] {
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw.split(',').map(x=>x.trim()).filter(Boolean)
}

function blankGuest(guestNumber:1|2):GuestOrder {
  return {
    guestNumber,
    dietary:[],
    dietaryComments:'',
    entree:'',
    pancakes:'',
    meat:'',
    eggs:'',
    coffee:'',
    cream:'',
    juice:'',
    condiments:[],
    mealDeclined:false
  }
}

export default function BreakfastMenu({token}:{token:string}) {
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [success,setSuccess] = useState(false)
  const [data,setData] = useState<any>(null)
  const [guest2Choice,setGuest2Choice] = useState<Guest2Choice>('undecided')
  const [guests,setGuests] = useState<GuestOrder[]>([blankGuest(1)])

  useEffect(()=>{
    async function load() {
      setLoading(true)
      const r = await fetch(`/api/guest/menu/bootstrap?token=${encodeURIComponent(token)}`,{cache:'no-store'})
      const json = await r.json().catch(()=>({}))
      if (!r.ok || !json.ok) {
        setError(json.message || 'We could not load your breakfast menu.')
        setLoading(false)
        return
      }
      setData(json)
      if (json.existingOrders?.length) {
        const mapped:GuestOrder[] = json.existingOrders.map((o:any)=>({
          guestNumber:Number(o.guest_number) as 1|2,
          dietary:splitDietary(o.dietary),
          dietaryComments:o.dietary_comments || '',
          entree:o.entree || '',
          pancakes:o.pancakes || '',
          meat:o.meat || '',
          eggs:o.eggs || '',
          coffee:o.coffee || '',
          cream:o.cream || '',
          juice:o.juice || '',
          condiments:String(o.condiments || '').split(',').map((x:string)=>x.trim()).filter(Boolean),
          mealDeclined:Boolean(o.meal_declined)
        }))
        if (mapped.length) setGuests(mapped)
        const existingGuest2 = mapped.find(g=>g.guestNumber===2)
        if (existingGuest2?.mealDeclined) setGuest2Choice('declined')
        else if (existingGuest2) setGuest2Choice('ordering')
      }
      setLoading(false)
    }
    load()
  },[token])

  const byCategory = useMemo(()=>{
    const map = new Map<string,Option[]>()
    for (const o of data?.options || []) {
      const current = map.get(o.category) || []
      current.push(o)
      map.set(o.category,current)
    }
    return map
  },[data])

  function setGuest(number:1|2,changes:Partial<GuestOrder>) {
    setGuests(prev=>{
      const exists = prev.some(g=>g.guestNumber===number)
      if (!exists) return [...prev,{...blankGuest(number),...changes}]
      return prev.map(g=>g.guestNumber===number ? {...g,...changes} : g)
    })
  }

  function chooseGuest2(choice:Guest2Choice) {
    setGuest2Choice(choice)
    if (choice==='ordering') {
      setGuest(2,{mealDeclined:false})
    } else if (choice==='declined') {
      setGuests(prev=>[
        ...prev.filter(g=>g.guestNumber!==2),
        {...blankGuest(2),mealDeclined:true}
      ])
    } else {
      setGuests(prev=>prev.filter(g=>g.guestNumber!==2))
    }
  }

  function categoryOptions(category:string,entree:string,dietary:string[]) {
    return (byCategory.get(category) || []).filter(o=>{
      const entreeRules = o.show_for_entree || []
      if (entreeRules.length && !entreeRules.includes(entree)) return false
      const blocked = o.blocked_by_dietary || []
      if (blocked.some(r=>dietary.includes(r))) return false
      return true
    })
  }

  function dietaryToggle(current:string[],label:string) {
    if (label === NO_DR) return current.includes(NO_DR) ? [] : [NO_DR]
    const base = current.filter(x=>x!==NO_DR)
    if (base.includes(label)) return base.filter(x=>x!==label)
    return [...base,label]
  }

  function updateDietary(guest:GuestOrder,nextDietary:string[]) {
    const vegan = nextDietary.includes(VEGAN)
    const needsComments = COMMENT_DRS.some(label=>nextDietary.includes(label))

    setGuest(guest.guestNumber,{
      dietary:nextDietary,
      dietaryComments:needsComments ? guest.dietaryComments : '',
      entree:vegan ? '' : guest.entree,
      pancakes:vegan ? '' : guest.pancakes,
      meat:vegan ? '' : guest.meat,
      eggs:vegan ? '' : guest.eggs,
      coffee:vegan ? '' : guest.coffee,
      cream:vegan ? '' : guest.cream,
      juice:vegan ? '' : guest.juice,
      condiments:vegan ? [] : guest.condiments,
      mealDeclined:false
    })
  }

  function ChoiceGrid({category,value,onChange,entree='',dietary=[],multi=false,dietaryMode=false}:{category:string;value:string|string[];onChange:(v:any)=>void;entree?:string;dietary?:string[];multi?:boolean;dietaryMode?:boolean}) {
    const options = categoryOptions(category,entree,dietary)
    if (!options.length) return null
    return (
      <div className="menu-options">
        {options.map(o=>{
          const active = (multi || dietaryMode) ? (value as string[]).includes(o.label) : value===o.label
          const singleSelect = !multi && !dietaryMode
          return (
            <button
              type="button"
              key={o.id}
              className={`menu-choice ${active?'active':''}`}
              role={singleSelect ? 'radio' : undefined}
              aria-checked={singleSelect ? active : undefined}
              aria-pressed={!singleSelect ? active : undefined}
              onClick={()=>{
                if (dietaryMode) {
                  onChange(dietaryToggle(value as string[],o.label))
                } else if (multi) {
                  const arr = value as string[]
                  onChange(active ? arr.filter(x=>x!==o.label) : [...arr,o.label])
                } else {
                  onChange(o.label)
                }
              }}
            >
              <div className="menu-choice-title-row">
                <strong>{o.label}</strong>
                {singleSelect && active && <span className="menu-choice-selected">Selected</span>}
              </div>
              {o.description && <small>{o.description}</small>}
            </button>
          )
        })}
      </div>
    )
  }

  function validationMessage(g:GuestOrder) {
    if (g.mealDeclined) return ''
    if (!g.dietary.length) return `Please choose dietary restrictions for Guest ${g.guestNumber}, or select No Dietary Restrictions.`

    const commentsNeeded = COMMENT_DRS.some(x=>g.dietary.includes(x))
    if (commentsNeeded && !g.dietaryComments.trim()) return `Please add the requested dietary details for Guest ${g.guestNumber}.`

    if (g.dietary.includes(VEGAN)) return ''

    if (!g.entree) return `Please choose an entrée for Guest ${g.guestNumber}.`
    if (categoryOptions('meat',g.entree,g.dietary).length>0 && !g.meat) return `Please choose a meat selection for Guest ${g.guestNumber}.`
    if (categoryOptions('eggs',g.entree,g.dietary).length>0 && !g.eggs) return `Please choose an egg style for Guest ${g.guestNumber}.`
    if (!g.coffee) return `Please choose a coffee option for Guest ${g.guestNumber}.`
    if (g.coffee!=='None' && !g.cream) return `Please choose a cream option for Guest ${g.guestNumber}.`
    if (!g.juice) return `Please choose a juice option for Guest ${g.guestNumber}.`
    return ''
  }

  async function submit() {
    setError('')

    if (guest2Choice==='undecided') {
      setError('Please tell us whether Guest 2 is ordering breakfast or declining breakfast.')
      return
    }

    const guest1 = guests.find(g=>g.guestNumber===1) || blankGuest(1)
    const guest2 = guests.find(g=>g.guestNumber===2)
    const activeGuests = [guest1, ...(guest2 ? [guest2] : [])]

    if (!guest2) {
      setError('Please choose breakfast for Guest 2 or explicitly decline breakfast for Guest 2.')
      return
    }

    for (const guest of activeGuests) {
      const message = validationMessage(guest)
      if (message) {
        setError(message)
        return
      }
    }

    setSaving(true)
    const payloadGuests = activeGuests.map(g=>({
      ...g,
      dietary:g.mealDeclined ? '' : g.dietary.join(', '),
      dietaryComments:g.mealDeclined ? '' : g.dietaryComments,
      entree:g.mealDeclined || g.dietary.includes(VEGAN) ? '' : g.entree,
      pancakes:g.mealDeclined || g.dietary.includes(VEGAN) ? '' : g.pancakes,
      meat:g.mealDeclined || g.dietary.includes(VEGAN) ? '' : g.meat,
      eggs:g.mealDeclined || g.dietary.includes(VEGAN) ? '' : g.eggs,
      coffee:g.mealDeclined || g.dietary.includes(VEGAN) ? '' : g.coffee,
      cream:g.mealDeclined || g.dietary.includes(VEGAN) || g.coffee==='None' ? '' : g.cream,
      juice:g.mealDeclined || g.dietary.includes(VEGAN) ? '' : g.juice,
      condiments:g.mealDeclined || g.dietary.includes(VEGAN) ? [] : g.condiments,
      mealDeclined:g.mealDeclined
    }))

    const r = await fetch('/api/guest/menu/submit',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token,guests:payloadGuests})
    })
    const json = await r.json().catch(()=>({}))
    setSaving(false)
    if (!r.ok || !json.ok) {
      setError(json.message || 'We could not save your breakfast menu. Please try again.')
      return
    }
    setSuccess(true)
  }

  if (loading) return <div className="card hero"><div className="eyebrow">The Hotel Saugatuck</div><h1>Breakfast Menu</h1><p className="muted">Loading your menu…</p></div>
  if (error && !data) return <div className="card hero"><div className="eyebrow">The Hotel Saugatuck</div><h1>Breakfast Menu</h1><div className="notice error">{error}</div></div>
  if (success) return <div className="card hero"><div className="eyebrow">The Hotel Saugatuck</div><h1>Breakfast is set.</h1><p>Your menu has been received for <strong>{data.booking.serviceDateLabel}</strong> at <strong>{data.booking.displayTime}</strong>.</p><p className="muted">You may close this page.</p></div>

  const visibleGuests = guests.filter(g=>g.guestNumber===1 || (g.guestNumber===2 && guest2Choice==='ordering'))

  return (
    <div className="card breakfast-menu-card">
      <div className="hero" style={{paddingTop:12}}>
        <div className="eyebrow">The Hotel Saugatuck</div>
        <h1>Breakfast Menu</h1>
        <p className="muted"><strong>{data.booking.room}</strong> · {data.booking.serviceDateLabel} · {data.booking.displayTime}</p>
      </div>

      <div className="notice" style={{marginBottom:18}}>Choose breakfast for each guest in your room. Nothing is selected automatically. Once the menu is submitted, the menu link on the delivery-time screen will be locked.</div>

      {visibleGuests.map(g=>{
        const vegan = g.dietary.includes(VEGAN)
        const commentsNeeded = COMMENT_DRS.some(x=>g.dietary.includes(x))
        return (
          <Fragment key={g.guestNumber}>
            <section className="menu-guest">
              <h2>Guest {g.guestNumber}</h2>

              <div className="menu-section">
                <h3>Dietary restrictions</h3>
                <p className="muted">Select all that apply, or choose No Dietary Restrictions.</p>
                <ChoiceGrid
                  category="dietary"
                  value={g.dietary}
                  dietaryMode
                  dietary={g.dietary}
                  onChange={v=>updateDietary(g,v)}
                />
                {commentsNeeded && <div className="field" style={{marginTop:10}}>
                  <label>Dietary notes or allergies</label>
                  <textarea
                    rows={2}
                    value={g.dietaryComments}
                    onChange={e=>setGuest(g.guestNumber,{dietaryComments:e.target.value})}
                    placeholder="Please specify the restriction or allergy"
                  />
                </div>}
              </div>

              {vegan ? (
                <div className="notice" style={{marginTop:14}}><strong>We are happy to provide a vegan menu.</strong> Please see the front desk so we can assist with your breakfast selection.</div>
              ) : (
                <>
                  <div className="menu-section">
                    <h3>Entrée</h3>
                    <ChoiceGrid category="entree" dietary={g.dietary} value={g.entree} onChange={v=>setGuest(g.guestNumber,{entree:v,meat:'',eggs:''})}/>
                  </div>

                  {g.entree && categoryOptions('meat',g.entree,g.dietary).length>0 && <div className="menu-section"><h3>Meat selection</h3><ChoiceGrid category="meat" dietary={g.dietary} entree={g.entree} value={g.meat} onChange={v=>setGuest(g.guestNumber,{meat:v})}/></div>}
                  {g.entree && categoryOptions('eggs',g.entree,g.dietary).length>0 && <div className="menu-section"><h3>Eggs</h3><ChoiceGrid category="eggs" dietary={g.dietary} entree={g.entree} value={g.eggs} onChange={v=>setGuest(g.guestNumber,{eggs:v})}/></div>}

                  {g.entree && <>
                    <div className="menu-section"><h3>Coffee</h3><ChoiceGrid category="coffee" dietary={g.dietary} value={g.coffee} onChange={v=>setGuest(g.guestNumber,{coffee:v,cream:v==='None'?'':g.cream})}/></div>
                    {g.coffee && g.coffee!=='None' && <div className="menu-section"><h3>Cream</h3><ChoiceGrid category="cream" dietary={g.dietary} value={g.cream} onChange={v=>setGuest(g.guestNumber,{cream:v})}/></div>}
                    <div className="menu-section"><h3>Juice</h3><ChoiceGrid category="juice" dietary={g.dietary} value={g.juice} onChange={v=>setGuest(g.guestNumber,{juice:v})}/></div>
                    <div className="menu-section"><h3>Condiments</h3><p className="muted">Choose any that you would like included.</p><ChoiceGrid category="condiments" dietary={g.dietary} value={g.condiments} multi onChange={v=>setGuest(g.guestNumber,{condiments:v})}/></div>
                  </>}
                </>
              )}
            </section>

            {g.guestNumber===1 && <section className="menu-guest guest2-decision">
              <h2>Guest 2</h2>
              <p className="muted">Please choose one. This is required so we know whether a second breakfast is needed.</p>
              <div className="guest2-choice-grid">
                <button type="button" className={`menu-choice ${guest2Choice==='ordering'?'active':''}`} onClick={()=>chooseGuest2('ordering')}>
                  <div className="menu-choice-title-row"><strong>Add breakfast for Guest 2</strong>{guest2Choice==='ordering'&&<span className="menu-choice-selected">Selected</span>}</div>
                  <small>Guest 2 will choose their own breakfast selections.</small>
                </button>
                <button type="button" className={`menu-choice ${guest2Choice==='declined'?'active':''}`} onClick={()=>chooseGuest2('declined')}>
                  <div className="menu-choice-title-row"><strong>No breakfast for Guest 2</strong>{guest2Choice==='declined'&&<span className="menu-choice-selected">Selected</span>}</div>
                  <small>Guest 2 is explicitly declining breakfast.</small>
                </button>
              </div>
              {guest2Choice==='declined' && <div className="notice" style={{marginTop:12}}><strong>Guest 2 declined breakfast.</strong> This will be shown to the kitchen so the room is not treated as missing a second menu.</div>}
            </section>}
          </Fragment>
        )
      })}

      {error && <div className="notice error" style={{marginTop:16}}>{error}</div>}

      <button className="btn sage" style={{width:'100%',marginTop:18}} disabled={saving} onClick={submit}>
        {saving ? 'Saving breakfast…' : data.booking.menuSubmitted ? 'Update breakfast menu' : 'Submit breakfast menu'}
      </button>
    </div>
  )
}
