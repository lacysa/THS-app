import {redirect} from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'
import {getStaffAccess} from '@/lib/access'

export const dynamic='force-dynamic'
export default async function RoomInspectionsPage({searchParams}:{searchParams:Promise<{date?:string;room?:string;inspectionRoom?:string}>}){
 const access=await getStaffAccess()
 if(!access)redirect('/login')
 const caps=access.capabilities||[]
 const allowed=access.isAdmin||(access.permissions||[]).includes('room_checks.perform')||caps.some(cap=>['hospitality_assistant','room_checks','ha_signoff','ha_signoff_override','manager','general_manager','operations_manager','owner'].includes(cap))
 if(!allowed)redirect('/dashboard')
 const params=await searchParams
 const initialDate=/^20\d{2}-\d{2}-\d{2}$/.test(params?.date||'')?params.date:undefined
 const room=params?.inspectionRoom||params?.room||''
 const initialRoomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(room)?room:undefined
 return <StaffShell title="Housekeeping"><UnifiedRoomsBoard initialDate={initialDate} initialInspectionRoomId={initialRoomId} initialView="inspections" allowAssignments={Boolean(access.isAdmin||caps.some(cap=>['manager','general_manager','operations_manager','owner'].includes(cap)))}/></StaffShell>
}
