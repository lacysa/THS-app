import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'
import StaffShell from '@/components/StaffShell'
import FrontDeskBoard from '@/components/FrontDeskBoard'
import { bohDefaultServiceDate } from '@/lib/time'

export default async function FrontDeskPage({searchParams}:{searchParams:Promise<{date?:string;roomId?:string}>}) {
  const params=await searchParams
  const requestedDate=String(params?.date||'')
  const initialDate=/^20\d{2}-\d{2}-\d{2}$/.test(requestedDate)&&!Number.isNaN(Date.parse(requestedDate+'T12:00:00Z'))?requestedDate:bohDefaultServiceDate()
  const targetRoom=/^[0-9a-f-]{36}$/i.test(String(params?.roomId||''))?String(params.roomId):''
  const gate = await canUseModule('front_desk')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  return (
    <StaffShell title="Breakfast Orders">
      <FrontDeskBoard key={initialDate+":"+targetRoom} initialDate={initialDate} targetRoom={targetRoom} />
    </StaffShell>
  )
}
