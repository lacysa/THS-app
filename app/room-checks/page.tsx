import {redirect} from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import InspectionWorkspace from '@/components/InspectionWorkspace'
import {canUseModule} from '@/lib/access'

export const dynamic='force-dynamic'
export default async function RoomInspectionsPage({searchParams}:{searchParams:Promise<{date?:string;room?:string;inspectionRoom?:string}>}){
 const gate=await canUseModule('housekeeping')
 if(!gate.access)redirect('/login')
 if(!gate.allowed)redirect('/dashboard')
 const caps=gate.access.capabilities||[]
 const allowed=gate.access.isAdmin||(gate.access.permissions||[]).includes('room_checks.perform')||caps.some(cap=>['room_checks','ha_signoff','ha_signoff_override','manager','general_manager','operations_manager','owner'].includes(cap))
 if(!allowed)redirect('/dashboard')
 const params=await searchParams
 const initialDate=/^20\d{2}-\d{2}-\d{2}$/.test(params?.date||'')?params.date:undefined
 const room=params?.inspectionRoom||params?.room||''
 const initialRoomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(room)?room:undefined
 return <StaffShell title="Room Inspections"><InspectionWorkspace initialDate={initialDate} initialRoomId={initialRoomId}/></StaffShell>
}
