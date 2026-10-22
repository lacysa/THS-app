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
/** Already-clean arrival conditions do not imply a checkout or full clean. */
export const isPrecleanedCondition=(value:unknown)=>[
 'vacant (clean)','ready','arrival ready','room ready','ready for guest',
 'guest ready','ready for room check','clean'
].includes(norm(value))
export const isUnreadyCondition=(value:unknown)=>[
 'occupied','vacant (dirty)','dirty','cleaning'
].includes(norm(value))
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
 if(row.inspected)return 'passed'
 // Arrival-only rooms can still receive their independent check even when
 // management previously confirmed the physical condition as clean.
 // Preserve the explicit FOH verification bypass for actual turnovers.
 if(row.fohSignedBy&&!arrival)return 'passed'
 // Departure turnover must be confirmed OUT, cleaned, and submitted for inspection.
 if(turnover)return out(row.serviceType)&&Boolean(row.complete&&row.readyForInspection)?'ready':'waiting'
 // An arrival does not require a fabricated OUT. Explicitly occupied or dirty
 // conditions must be corrected by a manager before inspection.
 if(arrival){
   if(isUnreadyCondition(condition))return 'waiting'
   if(isPrecleanedCondition(condition))return 'ready'
   // Arrival days without a recorded condition still require a physical check.
   return 'ready'
 }
 return row.complete&&row.readyForInspection?'ready':'waiting'
}
export const roomCheckRequired=(row:RoomCheckCandidate)=>roomCheckStage(row)!=='not-required'
