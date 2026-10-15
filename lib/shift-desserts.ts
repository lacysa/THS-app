/** Shared read-only dessert allocation rules for Shift Report and breakfast notices. */
export type DessertEntry={id:string;name:string;roomIds:string[]}
export type DessertRoom={roomId:string;roomName:string}
export type DessertDisplay=DessertEntry&{rooms:DessertRoom[];allRooms:boolean}

export function normalizeDessertEntries(raw:unknown,legacy=''):DessertEntry[]{
  if(Array.isArray(raw)){
    const clean=raw.slice(0,40).map((item:any,index:number)=>({
      id:String(item?.id||'dessert-'+index).slice(0,100),
      name:String(item?.name||'').trim().slice(0,500),
      roomIds:Array.isArray(item?.roomIds)?[...new Set<string>(item.roomIds.filter((v:unknown)=>typeof v==='string'&&v.length<=100))].slice(0,100):[]
    })).filter(item=>item.name)
    if(clean.length)return clean
  }
  const name=String(legacy||'').trim()
  return name?[{id:'legacy',name,roomIds:[]}]:[]
}

/**
 * No selected rooms means a dessert is the default for all eligible rooms.
 * An explicitly assigned dessert takes precedence over the default.
 * Last explicit selection wins in case of older conflicting saved entries.
 */
export function resolveDessertAssignments(entries:DessertEntry[],eligibleRooms:DessertRoom[]):DessertDisplay[]{
  const byId=new Map(eligibleRooms.map(r=>[r.roomId,r]))
  const direct=new Map<string,string>()
  let fallbackId=''
  for(const e of entries){
    if(e.roomIds.length===0)fallbackId=e.id
    else for(const id of e.roomIds)if(byId.has(id))direct.set(id,e.id)
  }
  const roomsByEntry=new Map(entries.map(e=>[e.id,[] as DessertRoom[]]))
  for(const room of eligibleRooms){
    const id=direct.get(room.roomId)||fallbackId
    if(id)roomsByEntry.get(id)?.push(room)
  }
  return entries.map(entry=>({...entry,rooms:roomsByEntry.get(entry.id)||[],allRooms:entry.roomIds.length===0}))
}
