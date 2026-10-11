'use client'

import {useState} from 'react'

type SheetRoom={name:string;status:string;service:string;packages:string[];notes:string[];dessert:boolean;lateArrival:boolean}
export type SheetExport={isoDate:string;dateLabel:string;metrics:{label:string;value:number}[];rows:SheetRoom[]}

function wrap(ctx:CanvasRenderingContext2D,input:string,width:number):string[]{
 const result:string[]=[]
 for(const part of String(input||'').replace(/\r/g,'').split('\n')){
  let current=''
  for(let word of part.split(/\s+/).filter(Boolean)){
   while(ctx.measureText(word).width>width){
    let n=1
    while(n<word.length&&ctx.measureText(word.slice(0,n+1)).width<=width)n++
    if(current){result.push(current);current=''}
    result.push(word.slice(0,n));word=word.slice(n)
   }
   const next=current?current+' '+word:word
   if(ctx.measureText(next).width<=width)current=next
   else {if(current)result.push(current);current=word}
  }
  result.push(current)
 }
 return result
}

function generatePdf(sheet:SheetExport):Blob{
 const W=612,H=792,S=2,L=32,R=580,B=744,X=190
 const pages:HTMLCanvasElement[]=[]
 let ctx:CanvasRenderingContext2D
 let y=0
 const stroke=(a:number,b:number,c:number,d:number,color:string)=>{
  ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke()
 }
 const addPage=()=>{
  const canvas=document.createElement('canvas')
  canvas.width=W*S;canvas.height=H*S
  const context=canvas.getContext('2d',{alpha:false})
  if(!context)throw new Error('Your browser cannot render the PDF.')
  pages.push(canvas);ctx=context;ctx.scale(S,S)
  ctx.fillStyle='white';ctx.fillRect(0,0,W,H)
  ctx.fillStyle='#5d7889';ctx.font='bold 9px Arial';ctx.fillText('THE HOTEL SAUGATUCK  ·  OPERATIONS',L,35)
  ctx.fillStyle='#162c3b';ctx.font='bold 23px Georgia'
  ctx.fillText('Daily Operations Sheet'+(pages.length>1?' (continued)':''),L,64)
  ctx.fillStyle='#597588';ctx.font='11px Arial';ctx.fillText(sheet.dateLabel,L,82)
  stroke(L,94,R,94,'#9fd2df')
  if(pages.length===1){
   const gap=8,w=(R-L-gap*3)/4,top=110
   sheet.metrics.slice(0,4).forEach((m,i)=>{
    const x=L+i*(w+gap)
    ctx.strokeStyle='#d3e3ec';ctx.beginPath();ctx.roundRect(x,top,w,59,8);ctx.stroke()
    ctx.fillStyle='#4c6a7b';ctx.font='9px Arial'
    wrap(ctx,m.label,w-14).slice(0,2).forEach((t,j)=>ctx.fillText(t,x+9,top+15+j*10))
    ctx.fillStyle='#172c3c';ctx.font='bold 21px Arial';ctx.fillText(String(m.value),x+9,top+48)
   })
   y=190
  }else y=118
  ctx.fillStyle='#1e3545';ctx.font='bold 13px Georgia'
  ctx.fillText(pages.length===1?'Room-by-room activity · All '+sheet.rows.length+' rooms':'Room-by-room activity · continued',L,y)
  y+=10;ctx.fillStyle='#edf4f8';ctx.fillRect(L,y,R-L,25)
  ctx.fillStyle='#263f4e';ctx.font='bold 9px Arial'
  ctx.fillText('ROOM',L+6,y+16);ctx.fillText("TODAY'S ACTIVITY / DELIVERY / NOTES",X,y+16);ctx.fillText('DONE',R-36,y+16)
  y+=28
 }
 addPage()
 for(const room of sheet.rows){
  ctx!.font='bold 9px Arial'
  const tags=[room.status,room.service,room.dessert?'Dessert':'',room.lateArrival?'Late arrival':'',...(room.packages||[]).map(p=>'Package: '+p)].filter(Boolean)
  const entries:{kind:'tag'|'note';text:string}[]=wrap(ctx!,tags.join(' · '),346).map(text=>({kind:'tag',text}))
  ctx!.font='9px Arial'
  for(const note of room.notes||[])wrap(ctx!,'Note: '+note,344).forEach(text=>entries.push({kind:'note',text}))
  let offset=0,first=true
  while(first||offset<entries.length){
   if(y+40>B)addPage()
   const top=y
   ctx!.fillStyle='#263b4b';ctx!.font='bold 10px Arial'
   wrap(ctx!,room.name+(first?'':' (cont.)'),140).forEach((t,j)=>ctx!.fillText(t,L+6,top+15+j*12))
   if(first){ctx!.strokeStyle='#9aacb8';ctx!.strokeRect(R-22,top+7,9,9)}
   let ty=top+14,used=0
   while(offset+used<entries.length && ty+13<B){
    const entry=entries[offset+used]
    ctx!.font=entry.kind==='tag'?'bold 9px Arial':'9px Arial'
    ctx!.fillStyle=entry.kind==='tag'?'#344f60':'#50697a'
    ctx!.fillText(entry.text,X,ty)
    ty+=12.5;used++
   }
   offset+=used
   y=Math.max(top+36,ty+8)
   stroke(L,y,R,y,'#dce7ee');y+=3;first=false
   if(offset<entries.length)addPage()
  }
 }
 pages.forEach((canvas,i)=>{
  const c=canvas.getContext('2d')!
  c.setTransform(S,0,0,S,0,0)
  c.strokeStyle='#dce7ee';c.beginPath();c.moveTo(L,761);c.lineTo(R,761);c.stroke()
  c.fillStyle='#698090';c.font='8px Arial'
  c.fillText('Live THS operations snapshot · Checkboxes are for paper use only',L,775)
  c.textAlign='right';c.fillText(String(i+1)+' / '+pages.length,R,775)
 })
 const enc=new TextEncoder(),chunks:Uint8Array[]=[],offsets:number[]=[0]
 let size=0
 const put=(b:Uint8Array)=>{chunks.push(b);size+=b.length}
 const txt=(s:string)=>put(enc.encode(s))
 const start=(i:number)=>{offsets[i]=size;txt(String(i)+' 0 obj\n')}
 const end=()=>txt('endobj\n')
 txt('%PDF-1.4\n%THS\n')
 start(1);txt('<< /Type /Catalog /Pages 2 0 R >>\n');end()
 start(2);txt('<< /Type /Pages /Kids ['+pages.map((_,i)=>String(3+i*3)+' 0 R').join(' ')+'] /Count '+pages.length+' >>\n');end()
 pages.forEach((canvas,i)=>{
  const pid=3+i*3,img=pid+1,content=pid+2
  start(pid);txt('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 '+img+' 0 R >> >> /Contents '+content+' 0 R >>\n');end()
  const uri=canvas.toDataURL('image/jpeg',.87)
  if(!uri.startsWith('data:image/jpeg;base64,'))throw new Error('PDF image creation failed.')
  const raw=atob(uri.split(',')[1]),bytes=new Uint8Array(raw.length)
  for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j)
  start(img);txt('<< /Type /XObject /Subtype /Image /Width 1224 /Height 1584 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bytes.length+' >>\nstream\n')
  put(bytes);txt('\nendstream\n');end()
  const commands='q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n'
  start(content);txt('<< /Length '+enc.encode(commands).length+' >>\nstream\n'+commands+'endstream\n');end()
 })
 const xref=size,n=2+pages.length*3
 txt('xref\n0 '+(n+1)+'\n0000000000 65535 f \n')
 for(let i=1;i<=n;i++)txt(String(offsets[i]).padStart(10,'0')+' 00000 n \n')
 txt('trailer\n<< /Size '+(n+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n')
 const result=new Uint8Array(size);let pos=0
 chunks.forEach(b=>{result.set(b,pos);pos+=b.length})
 return new Blob([result.buffer as ArrayBuffer],{type:'application/pdf'})
}

export default function DailySheetPrintButton({sheet}:{sheet:SheetExport}){
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const download=()=>{
  if(busy)return
  setBusy(true);setError('')
  try{
   const blob=generatePdf(sheet),url=URL.createObjectURL(blob)
   const anchor=document.createElement('a')
   anchor.href=url;anchor.download='THS-Daily-Operations-'+sheet.isoDate+'.pdf'
   document.body.appendChild(anchor);anchor.click();anchor.remove()
   window.setTimeout(()=>URL.revokeObjectURL(url),60000)
  }catch(err){setError(err instanceof Error?err.message:'PDF export failed. Please try again.')}
  finally{setBusy(false)}
 }
 return <div className="sheet-print-actions">
  <button type="button" disabled={busy} onClick={download}>{busy?'Preparing PDF…':'Download PDF'}</button>
  <button type="button" onClick={()=>window.print()}>Print</button>
  {error&&<small role="alert" className="sheet-print-error">{error}</small>}
 </div>
}
