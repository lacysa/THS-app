import type { AssignmentStaff } from '@/lib/assignment-staff'

export type LegacyStaffOption = {
  id:string; name:string; roleLabel?:string; fullRoomCleanLimit?:number;
  shiftStart?:string|null; shiftEnd?:string|null; onSite?:boolean;
  scheduleState?:string; housekeepingEligible?:boolean
}

/** Adapt existing Room Board and Housekeeping Board staff lists without changing their save logic. */
export function staffPickerOptions(available:LegacyStaffOption[], all:LegacyStaffOption[]):AssignmentStaff[] {
  const roster = all.length ? all : available
  const allowed = new Set(available.map(person=>String(person.id)))
  const onSite = new Map(available.filter(person=>person.onSite).map(person=>[String(person.id),person]))
  return roster.map(person=>{
    const onsitePerson = onSite.get(String(person.id))
    const scheduled = Boolean(onsitePerson || person.onSite)
    const roleLabel=String(onsitePerson?.roleLabel||person.roleLabel||'')
    const state = person.scheduleState || (scheduled?'onsite':allowed.has(String(person.id))?'not_scheduled':'unavailable')
    return {
      id:String(person.id),name:String(person.name),authUserId:'',
      roleLabel, onSite:scheduled, scheduleState:state,
      housekeepingEligible:person.housekeepingEligible ?? /housekeep|hospitality|runner|laundry/i.test(roleLabel),
      shiftStart:onsitePerson?.shiftStart||person.shiftStart||null,
      shiftEnd:onsitePerson?.shiftEnd||person.shiftEnd||null,
      fullRoomCleanLimit:Number(person.fullRoomCleanLimit??2)
    }
  }).sort((a,b)=>Number(b.onSite)-Number(a.onSite)||Number(b.housekeepingEligible)-Number(a.housekeepingEligible)||a.name.localeCompare(b.name))
}
