'use client'
import {useState} from 'react'
import HousekeepingInspectionMode from '@/components/HousekeepingInspectionMode'
import {ymdInHotelTz} from '@/lib/time'
export default function InspectionWorkspace({initialDate,initialRoomId}:{initialDate?:string;initialRoomId?:string}){
 const [date,setDate]=useState(initialDate||ymdInHotelTz())
 return <div className="module-pretty-page"><HousekeepingInspectionMode date={date} onDateChange={setDate} initialRoomId={initialRoomId}/></div>
}
