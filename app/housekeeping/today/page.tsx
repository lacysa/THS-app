import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { canUseModule } from '@/lib/access'
import TodaysCleans from '@/components/TodaysCleans'
export const dynamic='force-dynamic'
export default async function Page({searchParams}:{searchParams:Promise<{date?:string;room?:string}>}){
  const gate=await canUseModule('housekeeping_today_cleans')
 const access=gate.access
  if(!access)redirect('/login')
  if(!gate.allowed)redirect('/dashboard')
  const caps=access.capabilities||[]
  if(!access.isAdmin&&!caps.some(c=>['manager','general_manager','operations_manager','owner','housekeeping','hospitality_assistant'].includes(c)))redirect('/dashboard')
  const params=await searchParams
  const initialDate=/^20\d{2}-\d{2}-\d{2}$/.test(params?.date||'')?params.date:undefined
  const initialRoomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params?.room||'')?params.room:undefined
  return <StaffShell title="Today's Cleans"><TodaysCleans initialDate={initialDate} initialRoomId={initialRoomId}/></StaffShell>
}
