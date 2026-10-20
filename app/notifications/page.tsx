import {redirect} from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import NotificationsCenter from '@/components/NotificationsCenter'
import {getStaffAccess} from '@/lib/access'

export const dynamic='force-dynamic'

export default async function NotificationsPage({searchParams}:{searchParams:Promise<{focus?:string}>}){
 const access=await getStaffAccess()
 if(!access)redirect('/login')
 const params=await searchParams
 const focus=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params?.focus||'')?params.focus:undefined
 return <StaffShell title="Notifications"><NotificationsCenter initialFocus={focus}/></StaffShell>
}
