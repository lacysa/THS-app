import { createSupabaseAdmin } from '@/lib/supabase/admin'

export type AssignmentStaff = {
  id: string
  name: string
  authUserId: string
  roleLabel: string
  onSite: boolean
  housekeepingEligible: boolean
  scheduleState: string
  shiftStart: string | null
  shiftEnd: string | null
  fullRoomCleanLimit: number
}

/** Date-aware staff list shared by Housekeeping Assignments and Room Operations. */
export async function loadAssignmentStaff(admin: ReturnType<typeof createSupabaseAdmin>, date: string): Promise<AssignmentStaff[]> {
  const [staffResult, scheduleResult, capabilitiesResult] = await Promise.all([
    admin.from('staff_members').select('id,name,auth_user_id,job_title,full_room_clean_limit').eq('active', true).order('name'),
    admin.from('staff_daily_schedule').select('staff_member_id,shift_start,shift_end,role_label,work_mode').eq('schedule_date', date),
    admin.from('staff_member_capabilities').select('staff_member_id,capability_key')
  ])
  for (const result of [staffResult, scheduleResult, capabilitiesResult]) {
    if (result.error) throw new Error(result.error.message)
  }
  const scheduleByStaff = new Map<string, any>()
  for (const shift of scheduleResult.data || []) {
    const id = String(shift.staff_member_id)
    const existing = scheduleByStaff.get(id)
    if (!existing || (shift.work_mode === 'onsite' && existing.work_mode !== 'onsite')) scheduleByStaff.set(id, shift)
  }
  const capabilitiesByStaff = new Map<string, Set<string>>()
  for (const row of capabilitiesResult.data || []) {
    const id = String(row.staff_member_id)
    const caps = capabilitiesByStaff.get(id) || new Set<string>()
    caps.add(String(row.capability_key || ''))
    capabilitiesByStaff.set(id, caps)
  }
  return (staffResult.data || []).map(person => {
    const shift = scheduleByStaff.get(String(person.id))
    const roleLabel = String(shift?.role_label || person.job_title || '')
    const capabilities = capabilitiesByStaff.get(String(person.id)) || new Set<string>()
    const housekeepingEligible = ['housekeeping','runner','hospitality_assistant','laundry'].some(cap => capabilities.has(cap)) || /housekeep|hospitality|laundry|runner/i.test(roleLabel)
    return {
      id: String(person.id),
      name: String(person.name || ''),
      authUserId: String(person.auth_user_id || ''),
      roleLabel, housekeepingEligible,
      onSite: shift?.work_mode === 'onsite',
      scheduleState: String(shift?.work_mode || 'not_scheduled'),
      shiftStart: shift?.shift_start || null,
      shiftEnd: shift?.shift_end || null,
      fullRoomCleanLimit: Number(person.full_room_clean_limit ?? 2)
    }
  }).sort((a,b) => Number(b.onSite)-Number(a.onSite) || Number(b.housekeepingEligible)-Number(a.housekeepingEligible) || a.name.localeCompare(b.name))
}
