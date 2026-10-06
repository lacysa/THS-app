export type ParsedReservation = {
  reservationKey:string; reservationNumber:string|null; guestName:string; phone:string|null; doorCode:string|null;
  arrivalDate:string|null; checkoutDate:string|null; roomName:string|null; occupancy:number|null; ratePlan:string|null;
  checkInTime:string|null; productsRaw:string|null; dietaryRestrictions:string|null; referralSource:string|null;
  reasonForVisit:string|null; guestComments:string|null; innkeeperNotes:string|null; sourcePage:number; rawText:string;
  confidence:number; needsReview:boolean; warnings:string[];
}

const ORDER_RE=/(?:order\s*[:#]?\s*|\(order\s*[:#]?\s*)(\d{4,8})\)?/i;
const DATE_RE=/\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})\b/g;
const PHONE_RE=/(?:Phone|Cell)\s*[:;]?\s*\+?1?\s*([2-9]\d{2})[\s.\-)]*([2-9]\d{2})[\s.\-]*([0-9]{4})/i;
const TIME_RE=/\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i;

function clean(value:unknown){const s=String(value??'').replace(/\s+/g,' ').replace(/^[:;\-\s]+|[\s/]+$/g,'').trim();return s||null}
function norm(v:string){return v.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function isoDate(v:string){const m=v.match(/(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/);return m?m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'):null}
function findRoom(text:string,rooms:string[]){const n=norm(text);return rooms.find(r=>n.includes(norm(r)))||null}
function looksLikeName(line:string){
  if(!line||/\d/.test(line)||/,\s*[A-Z]{2}\b/.test(line))return false;
  if(/^(arrival|checkout|stay.?over|selection criteria|ordered by date|date|nights|room|occ|products|checkin|phone|cell|room only|room \+ breakfast|peace of mind|cancellation coverage|do you have|how did you|reason for)/i.test(line))return false;
  const words=line.trim().split(/\s+/);return line.length<=70&&words.length>=2&&words.length<=6&&words.every(w=>/^[A-Za-zÀ-ÿ'’.-]+$/.test(w));
}
function guestName(lines:string[],roomLine:number,orderLine:number,room:string|null){
  if(room&&roomLine>=0){const same=lines[roomLine].replace(new RegExp(room.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&'),'i'),'').trim();if(looksLikeName(same))return same}
  for(let i=Math.min(orderLine-1,lines.length-1);i>=Math.max(0,orderLine-8);i--)if(looksLikeName(lines[i]))return lines[i];return '';
}
function closestDates(lines:string[],orderLine:number){
  const values:string[]=[];
  for(let i=orderLine;i>=Math.max(0,orderLine-8);i--){if(/selection criteria|Date\s*>=|arrival guests|checkout guests|stay.?over guests|total .* guests/i.test(lines[i]))continue;
    for(const m of [...lines[i].matchAll(DATE_RE)]){const d=isoDate(m[0]);if(d&&!values.includes(d))values.push(d)} if(values.length>=2)break}
  return values.slice(0,2).sort();
}
function noteSection(lines:string[],orderLine:number,rooms:string[]){
  const end=Math.min(lines.length,orderLine+16);let start=-1;
  for(let i=orderLine+1;i<end;i++){if(/Do you have any dietary restrictions/i.test(lines[i])){start=i;break}}
  if(start<0)return '';const out:string[]=[];
  for(let i=start;i<end;i++){const line=lines[i];if(i>start&&/arrival guests|checkout guests|stay.?over guests|total .* guests/i.test(line))break;
    if(i>start&&looksLikeName(line)&&findRoom(lines.slice(i,i+3).join(' '),rooms))break;out.push(line)}
  return out.join(' ');
}
function between(text:string,start:RegExp,stops:RegExp[]){const index=text.search(start);if(index<0)return null;const after=text.slice(index).replace(start,'');let stop=after.length;for(const re of stops){const i=after.search(re);if(i>=0)stop=Math.min(stop,i)}return clean(after.slice(0,stop))}
function notes(text:string){
  const dietary=between(text,/Do you have any dietary restrictions\??\s*:?/i,[/How did you hear about us\??/i,/Reason for Your Visit/i,/\[?GUEST COMMENT\]?/i,/\[?INNKEEPER NOTES\]?/i]);
  const referral=between(text,/How did you hear about us\??\s*:?/i,[/Reason for Your Visit/i,/\[?GUEST COMMENT\]?/i,/\[?INNKEEPER NOTES\]?/i]);
  const reason=between(text,/Reason for Your Visit\s*:?/i,[/\[?GUEST COMMENT\]?/i,/\[?INNKEEPER NOTES\]?/i]);
  const guest=between(text,/\[?GUEST COMMENT\]?\s*:?/i,[/\[?INNKEEPER NOTES\]?/i]);const innkeeper=between(text,/\[?INNKEEPER NOTES\]?\s*:?/i,[]);
  return {dietary,referral,reason,guest,innkeeper};
}
function rate(text:string){for(const re of [/Room\s*\+\s*Breakfast\s*\+\s*Cancellation Coverage/i,/Room\s*Only\s*\+\s*Cancellation Coverage/i,/Room\s*\+\s*Breakfast/i,/Room\s*Only/i,/Peace of Mind Rate/i]){const m=text.match(re);if(m)return clean(m[0])}return null}
function products(text:string){
  const found:string[]=[];for(const item of ['Seasonal Blooms','Chocolatier Board','Local Cheese & Fruit','Charcuterie Board','Chocolate Dipped Strawberries & Prosecco','Chocolate dipped Strawberries','Dozen Roses','Retreat to Romance','Veuve Clicquot Champagne']){
    const re=new RegExp('(\\d+\\s*x\\s*)?'+item.replace(/[.*+?^\${}()|[\]\\]/g,'\\$&'),'i');const m=text.match(re);if(m)found.push(m[0])}
  return clean([...new Set(found)].join('; '));
}
function occ(text:string){const vals=[...text.matchAll(/\b([1-4])\b/g)].map(m=>Number(m[1]));return vals.length?vals[vals.length-1]:null}

export function parseArrivalReportPages(pages:string[],roomNames:string[]){
  const reservations:ParsedReservation[]=[];const warnings:string[]=[];let reportStartDate:string|null=null;let reportEndDate:string|null=null;
  const criteria=(pages[0]||'').match(/Date\s*>=?\s*(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})\s*AND\s*Date\s*<=?\s*(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})/i);
  if(criteria){reportStartDate=isoDate(criteria[1]);reportEndDate=isoDate(criteria[2])}
  pages.forEach((pageText,pageIndex)=>{
    const lines=pageText.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    for(let orderLine=0;orderLine<lines.length;orderLine++){const om=lines[orderLine].match(ORDER_RE);if(!om)continue;
      const reservationNumber=om[1],start=Math.max(0,orderLine-9),windowText=lines.slice(start,orderLine+2).join(' '),roomName=findRoom(windowText,roomNames);
      const roomLine=roomName?lines.findIndex((line,index)=>index>=start&&index<=orderLine&&norm(line).includes(norm(roomName))):-1;
      const guest=guestName(lines,roomLine,orderLine,roomName),dates=closestDates(lines,orderLine),arrivalDate=dates[0]||null,checkoutDate=dates.length>1?dates[dates.length-1]:null;
      let phone:string|null=null;for(const line of lines.slice(Math.max(0,orderLine-4),Math.min(lines.length,orderLine+4))){const m=line.match(PHONE_RE);if(m){phone=m[1]+m[2]+m[3];break}}
      const tm=windowText.match(TIME_RE),checkInTime=tm?tm[1]+':'+tm[2]+' '+tm[3].toUpperCase():(/Not selected/i.test(windowText)?'Not selected':null);
      const noteText=noteSection(lines,orderLine,roomNames),n=notes(noteText),rowWarnings:string[]=[];
      if(!guest)rowWarnings.push('Guest name could not be read');if(!arrivalDate||!checkoutDate)rowWarnings.push('Arrival/checkout dates need review');if(!roomName)rowWarnings.push('Room could not be matched');if(!phone)rowWarnings.push('Phone number could not be read');
      let confidence=Math.max(0,100-rowWarnings.length*18-(rate(windowText)?0:5));
      reservations.push({reservationKey:'order:'+reservationNumber,reservationNumber,guestName:guest,phone,doorCode:phone?phone.slice(-4):null,arrivalDate,checkoutDate,roomName,occupancy:occ(windowText),ratePlan:rate(windowText),checkInTime,productsRaw:products(windowText),dietaryRestrictions:n.dietary,referralSource:n.referral,reasonForVisit:n.reason,guestComments:n.guest,innkeeperNotes:n.innkeeper,sourcePage:pageIndex+1,rawText:windowText+' '+noteText,confidence,needsReview:rowWarnings.length>0,warnings:rowWarnings});
    }
  });
  const map=new Map<string,ParsedReservation>();for(const row of reservations){const cur=map.get(row.reservationKey);if(!cur||row.confidence>cur.confidence)map.set(row.reservationKey,row)}
  const rows=[...map.values()];if(!rows.length)warnings.push('No reservation order numbers were detected. OCR may need review.');const review=rows.filter(r=>r.needsReview).length;if(review)warnings.push(review+' reservation'+(review===1?'':'s')+' need review before import.');
  return {reportStartDate,reportEndDate,reservations:rows,warnings};
}
export function normalizeEditedReservation(row:any,roomNames:string[]):ParsedReservation{
  const digits=String(row.phone||'').replace(/\D/g,''),phone=digits?digits.slice(-10):null,roomName=roomNames.includes(String(row.roomName||''))?String(row.roomName):null;
  const arrivalDate=/^20\d{2}-\d{2}-\d{2}$/.test(String(row.arrivalDate||''))?String(row.arrivalDate):null,checkoutDate=/^20\d{2}-\d{2}-\d{2}$/.test(String(row.checkoutDate||''))?String(row.checkoutDate):null,reservationNumber=clean(row.reservationNumber);
  const warnings:string[]=[];if(!clean(row.guestName))warnings.push('Guest name is required');if(!arrivalDate||!checkoutDate)warnings.push('Valid arrival and checkout dates are required');if(arrivalDate&&checkoutDate&&checkoutDate<arrivalDate)warnings.push('Checkout cannot be before arrival');if(!roomName)warnings.push('Room is required');
  return {reservationKey:reservationNumber?'order:'+reservationNumber:String(row.reservationKey||''),reservationNumber,guestName:clean(row.guestName)||'',phone,doorCode:phone?phone.slice(-4):null,arrivalDate,checkoutDate,roomName,occupancy:Number(row.occupancy)||null,ratePlan:clean(row.ratePlan),checkInTime:clean(row.checkInTime),productsRaw:clean(row.productsRaw),dietaryRestrictions:clean(row.dietaryRestrictions),referralSource:clean(row.referralSource),reasonForVisit:clean(row.reasonForVisit),guestComments:clean(row.guestComments),innkeeperNotes:clean(row.innkeeperNotes),sourcePage:Number(row.sourcePage)||0,rawText:String(row.rawText||''),confidence:Number(row.confidence)||0,needsReview:warnings.length>0,warnings};
}
