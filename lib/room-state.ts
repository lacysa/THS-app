export type RoomLike={
  reservationStatus?:string|null
  serviceType?:string|null
  stripHold?:string|null
  complete?:boolean|null
  inspected?:boolean|null
  checkIssueOpen?:boolean|null
  housekeeperAttested?:boolean|null
  housekeeperAttestedBy?:string|null
  haSignedBy?:string|null
  fohSignedBy?:string|null
  roomCondition?:string|null
}

export type RoomWorkflowState='blocked'|'refresh'|'cleaning'|'self'|'inspection'|'correction'|'final'|'ready'|'occupied'

export function normalizeRoomValue(value:unknown){return String(value||'').trim().toLowerCase()}
export function isStayoverRoom(row:RoomLike){return normalizeRoomValue(row.reservationStatus)==='stayover'}
export function isRefreshRoom(row:RoomLike){return isStayoverRoom(row)&&String(row.serviceType||'').trim().toUpperCase()==='RF'}
export function isBlockedRoom(row:RoomLike){return normalizeRoomValue(row.reservationStatus)==='blocked'||normalizeRoomValue(row.stripHold).includes('hold')}
export function requiresIndependentRoomCheck(row:RoomLike){return !isStayoverRoom(row)&&!isBlockedRoom(row)}
export function requiresHousekeeperSelfCheck(row:RoomLike){
  const status=normalizeRoomValue(row.reservationStatus)
  const service=String(row.serviceType||'').trim().toUpperCase()
  return requiresIndependentRoomCheck(row)&&(['checkout','out/in'].includes(status)||service.startsWith('OUT'))
}
export function finalVerificationComplete(row:RoomLike){return Boolean(row.fohSignedBy||row.haSignedBy)}

export function roomWorkflowState(row:RoomLike):RoomWorkflowState{
  if(isBlockedRoom(row))return 'blocked'
  if(row.checkIssueOpen)return 'correction'
  if(isRefreshRoom(row))return row.complete?'ready':'refresh'
  if(isStayoverRoom(row))return 'occupied'
  if(requiresHousekeeperSelfCheck(row)&&!row.housekeeperAttestedBy&&!row.housekeeperAttested)return 'self'
  if(!row.complete)return 'cleaning'
  // A FOH final check is an authorized manager bypass: it completes the final
  // verification path without leaving a phantom HA/inspection requirement.
  if(row.fohSignedBy)return 'ready'
  if(!row.inspected)return 'inspection'
  if(!row.haSignedBy)return 'final'
  return 'ready'
}

export function roomWorkflowLabel(row:RoomLike){
  const state=roomWorkflowState(row)
  if(state==='blocked')return 'Blocked'
  if(state==='correction')return 'Needs correction'
  if(state==='refresh')return 'Refresh'
  if(state==='occupied')return 'Occupied'
  if(state==='self')return 'Self-check'
  if(state==='cleaning')return 'Cleaning'
  if(state==='inspection')return 'Ready for room check'
  if(state==='final')return 'Final check'
  return 'Ready for guest'
}

export function roomNextAction(row:RoomLike){
  const state=roomWorkflowState(row)
  if(state==='blocked')return 'No action required'
  if(state==='correction')return 'Correct flagged items'
  if(state==='refresh')return 'Complete refresh'
  if(state==='occupied')return 'No service requested'
  if(state==='self')return 'Complete self-check'
  if(state==='cleaning')return 'Finish room clean'
  if(state==='inspection')return 'Perform room check'
  if(state==='final')return 'Complete final check'
  return 'Guest ready'
}

export function derivedLiveCondition(row:RoomLike){
  const state=roomWorkflowState(row)
  const reservation=normalizeRoomValue(row.reservationStatus)
  if(state==='blocked')return 'Blocked'
  if(state==='correction')return 'Needs Correction'
  if(state==='refresh'||state==='occupied')return 'Occupied'
  if(state==='self'||state==='cleaning')return 'Cleaning'
  if(state==='inspection')return 'Ready for Room Check'
  if(state==='final')return 'Final Check'
  if(state==='ready'){
    if(['checkout','vacant','dirty'].includes(reservation))return 'Vacant (Clean)'
    return 'Ready for Guest'
  }
  return row.roomCondition||''
}
