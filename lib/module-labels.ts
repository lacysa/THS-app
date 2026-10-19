// One set of visible module names for every staff role.
// Keys, URLs, roles, permissions, and stored module definitions stay unchanged.
export const STAFF_MODULE_LABELS: Readonly<Record<string,string>> = {
  dashboard: 'Dashboard',
  front_desk: 'Front Desk',
  kitchen: 'Kitchen',
  menu_manager: 'Menu Manager',
  breakfast_menu_manager: 'Menu Manager',
  daily_overview: 'Daily Overview',
  breakfast_guest: 'Guest Breakfast',
  reservations: 'Room Operations',
  ops: 'Calendar & Activity',
  reservation_sync: 'Reservation Sync',
  housekeeping: 'Housekeeping',
  room_board: 'Rooms',
  room_checks: 'Room Inspections',
  housekeeping_assignments: 'Assignments',
  housekeeping_setup: 'Housekeeping Setup',
  housekeeping_quality: 'HSK Quality',
  shift_reports: 'Shift Reports',
  projects: 'Projects',
  maintenance: 'Maintenance',
  laundry: 'Laundry',
  lobby: 'Lobby',
  housekeeping_guide: 'Housekeeping Manual',
  staff: 'Staff'
}

export function staffModuleLabel(module:{
  module_key:string
  label?:string|null
  title?:string|null
}):string {
  return STAFF_MODULE_LABELS[module.module_key] ||
    module.label?.trim() ||
    module.title?.trim() ||
    module.module_key
}
