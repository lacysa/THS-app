import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'
import { canUseModule } from '@/lib/access'

export const dynamic='force-dynamic'

export default async function Page({searchParams}:{searchParams:Promise<{filter?:string;room?:string;date?:string;view?:string;inspectionRoom?:string}>}){
  const [gate,assignmentGate]=await Promise.all([canUseModule('housekeeping'),canUseModule('housekeeping_assignments')])
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')
  const params=await searchParams
  const initialFilter=(['all','active','stayovers','cleaning','inspection','correction','complete'] as string[]).includes(params?.filter||'') ? params.filter as 'all'|'active'|'stayovers'|'cleaning'|'inspection'|'correction'|'complete' : undefined
  const initialRoomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params?.room||'')?params.room:undefined
  const initialInspectionRoomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params?.inspectionRoom||'')?params.inspectionRoom:undefined
  const initialDate=/^20\d{2}-\d{2}-\d{2}$/.test(params?.date||'')?params.date:undefined
  const manager=gate.access.isAdmin || (gate.access.capabilities||[]).some(cap=>['manager','general_manager','operations_manager','owner'].includes(cap))
  if(!manager) redirect('/housekeeping/today')
  const allowAssignments=Boolean(assignmentGate.allowed&&manager)
  const caps=gate.access.capabilities||[]
  const allowInspections=gate.access.isAdmin || (gate.access.permissions||[]).includes('room_checks.perform') ||
    caps.some(cap=>['room_checks','ha_signoff','ha_signoff_override','manager','general_manager','operations_manager','owner'].includes(cap))
  // Legacy bookmarks should open the focused modules without rendering the old board.
  // Room-specific deep links remain supported until their controls are migrated.
  if(!initialRoomId){
    const qs=initialDate?'?date='+encodeURIComponent(initialDate):''
    if(params?.view==='inspections'&&allowInspections)redirect('/room-checks'+qs+(initialInspectionRoomId?(qs?'&':'?')+'room='+encodeURIComponent(initialInspectionRoomId):''))
    if(allowAssignments)redirect('/housekeeping/assignments'+qs)
    if(allowInspections)redirect('/room-checks'+qs)
  }
  const initialView=!initialRoomId&&params?.view==='inspections'&&allowInspections?'inspections':
    allowAssignments&&!initialRoomId&&params?.view==='rooms'?'rooms':allowAssignments?'assignments':allowInspections?'inspections':'rooms'
  return <StaffShell title="Housekeeping"><UnifiedRoomsBoard initialFilter={initialRoomId?'all':initialFilter} initialRoomId={initialRoomId} initialDate={initialDate} initialView={initialView} initialInspectionRoomId={initialView==='inspections'?initialInspectionRoomId:undefined} allowAssignments={allowAssignments}/></StaffShell>
}
