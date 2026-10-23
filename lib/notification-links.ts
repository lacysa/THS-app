export type RoomNotification = {
 id:string
 notification_type:string
 title:string
 message:string
 room_id:string|null
 service_date:string|null
 created_at:string
 read_at:string|null
 archived_at?:string|null
}

// Do not accept arbitrary URLs from notification records.
export function notificationHref(n:RoomNotification,canOpenRooms:boolean):string{
 const validRoom=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(n.room_id||'')
 const validDate=/^20\d{2}-\d{2}-\d{2}$/.test(n.service_date||'')
 if(canOpenRooms && validRoom && validDate && n.notification_type==='room_ready_for_inspection')
  return '/room-checks?room='+encodeURIComponent(n.room_id!)+'&date='+encodeURIComponent(n.service_date!)
 if(canOpenRooms && validRoom && validDate)
  return '/housekeeping?room='+encodeURIComponent(n.room_id!)+'&date='+encodeURIComponent(n.service_date!)
 return '/notifications?focus='+encodeURIComponent(n.id)
}
export function notificationKind(n:RoomNotification){
 switch(n.notification_type){
  case 'room_ready_for_inspection':return 'Ready for inspection'
  case 'room_mention':return 'Mention'
  case 'housekeeping_correction':return 'Room correction'
  case 'housekeeping_recheck_passed':return 'Room re-check'
  default:return 'Notification'
 }
}
export function notificationDate(value:string){
 const date=new Date(value)
 return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Detroit',month:'short',day:'numeric',year:'numeric',
  hour:'numeric',minute:'2-digit'
 }).format(date)
}
