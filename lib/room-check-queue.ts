/**
 * Shared room-check rules for the dashboard, focused inspection queue, and API.
 * An arrival with no new clean requested still needs its arrival room check,
 * even when its daily room condition has not yet been manually recorded.
 * Vacant rooms without service/inspection activity must not inflate the target.
 */
export type RoomCheckCandidate={
 reservationStatus?:string|null
 serviceType?:string|null
 stripHold?:string|null
 roomCondition?:string|null
 complete?:boolean|null
 readyForInspection?:boolean|null
 inspected?:boolean|null
 checkIssueOpen?:boolean|null
 fohSignedBy?:string|null
}
export type RoomCheckStage='not-required'|'waiting'|'ready'|'recheck'|'correction'|'passed'
const norm=(v:unknown)=>String(v||'').trim().toLowerCase()
const out=(v:unknown)=>/^OUT(?:-[A-Z]{2,4})?$/i.test(String(v||'').trim())
export function roomCheckStage(row:RoomCheckCandidate):RoomCheckStage{
 const status=norm(row.reservationStatus)
 const condition=norm(row.roomCondition)
 const service=norm(row.serviceType)
 if(status==='blocked'||status==='stayover'||service==='rf'||norm(row.stripHold).includes('hold')||condition==='blocked')return 'not-required'
 const turnover=status==='checkout'||status==='out/in'||status==='dirty'||out(row.serviceType)
 const arrival=status==='arrival'
 const vacant=status==='vacant'
 const explicitlyRequested=Boolean(row.complete||row.readyForInspection||row.inspected||row.checkIssueOpen)||condition==='ready for room check'
 if(!turnover&&!arrival&&!((vacant||status==='')&&explicitlyRequested))return 'not-required'
 if(row.checkIssueOpen)return row.complete&&row.readyForInspection&&!row.inspected?'recheck':'correction'
 if(row.inspected||row.fohSignedBy)return 'passed'
 // Departure turnover must be confirmed OUT, cleaned, and submitted for inspection.
 if(turnover)return out(row.serviceType)&&Boolean(row.complete&&row.readyForInspection)?'ready':'waiting'
 // An arrival without a departure turnover needs an independent room check.
 // A known dirty, cleaning, or occupied arrival must be cleaned/released first.
 if(arrival){
   if(['occupied','dirty','vacant (dirty)','cleaning'].includes(condition))
     return row.complete&&row.readyForInspection?'ready':'waiting'
   return 'ready'
 }
 return row.complete&&row.readyForInspection?'ready':'waiting'
}
export const roomCheckRequired=(row:RoomCheckCandidate)=>roomCheckStage(row)!=='not-required'
