import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'
import { canUseModule } from '@/lib/access'

export const dynamic='force-dynamic'

export default async function Page({searchParams}:{searchParams:Promise<{filter?:string;room?:string;date?:string}>}){
  const gate=await canUseModule('housekeeping')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')
  const params=await searchParams
  const initialFilter=params?.filter==='inspection'||params?.filter==='correction' ? params.filter : undefined
  const initialRoomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params?.room||'')?params.room:undefined
  const initialDate=/^20\d{2}-\d{2}-\d{2}$/.test(params?.date||'')?params.date:undefined
  return <StaffShell title="Rooms"><UnifiedRoomsBoard initialFilter={initialRoomId?'all':initialFilter} initialRoomId={initialRoomId} initialDate={initialDate}/></StaffShell>
}
