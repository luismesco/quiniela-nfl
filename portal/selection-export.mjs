const AUTHOR='Luis Montañez Escobar';
export function selectionModel(data,userId){
 const person=data.participants.find(p=>p.id===userId);if(!person)throw Error('No se encontró al participante.');
 const games=data.games.map(g=>({id:g.id,away:g.away,home:g.home,start:g.start,
  choice:[g.away,g.home,'TIE'].includes(person.choices[g.id])?person.choices[g.id]:null}));
 return {name:person.name,season:data.season,week:data.week,phase:data.phase,roundId:data.roundId,testMode:!!data.testMode,
  complete:games.length>0&&games.every(g=>g.choice),games,teams:structuredClone(data.teams||{})};
}
const utf16=s=>'FEFF'+Array.from(s).map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('').toUpperCase();
export function jpegPdf(jpeg,width,height){
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
 const add=s=>{const b=typeof s==='string'?encoder.encode(s):s;chunks.push(b);length+=b.length;};
 const object=(n,s)=>{offsets[n]=length;add(`${n} 0 obj\n${s}\nendobj\n`);};
 add('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>');
 offsets[4]=length;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');
 const stream='q\n792 0 0 612 0 0 cm\n/Im1 Do\nQ\n';object(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
 object(6,`<< /Title <${utf16('Mi selección · La Quiniela Fiscalizada')}> /Author <${utf16(AUTHOR)}> /Creator <${utf16(AUTHOR)}> >>`);
 const start=length;add('xref\n0 7\n0000000000 65535 f \n');for(let i=1;i<=6;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
 add(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${start}\n%%EOF\n`);
 const out=new Uint8Array(length);let pos=0;for(const b of chunks){out.set(b,pos);pos+=b.length;}return out;
}
const loadImage=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo cargar una imagen de la selección.'));img.src=src;});
function text(ctx,value,x,y,max,size=32,bold=false){
 let s=size;ctx.font=`${bold?'700':'400'} ${s}px ${bold?'Condensed':'Barlow'}`;
 while(ctx.measureText(value).width>max&&s>13){s--;ctx.font=`${bold?'700':'400'} ${s}px ${bold?'Condensed':'Barlow'}`;}
 ctx.fillText(value,x,y,max);
}
export async function selectionCanvas(model,format='jpg'){
 await Promise.all([document.fonts.load('400 32px Barlow'),document.fonts.load('700 44px Condensed')]);
 const canvas=document.createElement('canvas');canvas.width=format==='pdf'?2376:2000;canvas.height=format==='pdf'?1836:2000;
 const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,pad=100,gap=55,colW=(W-pad*2-gap)/2;
 const codes=[...new Set(model.games.flatMap(g=>[g.away,g.home]))];
 const entries=await Promise.all(codes.map(async t=>[t,await loadImage(`/assets/teams/${encodeURIComponent(t)}.svg`)]));
 const images=Object.fromEntries(entries),mascot=await loadImage('/assets/mascotas/ajolote-investigador.png');
 ctx.fillStyle='#f7f7ed';ctx.fillRect(0,0,W,H);ctx.fillStyle='#142b30';ctx.fillRect(0,0,W,420);
 ctx.fillStyle='#d8ed88';text(ctx,'LA QUINIELA FISCALIZADA',pad,125,W-450,66,true);
 ctx.fillStyle='#ffffff';text(ctx,model.name,pad,240,W-500,86,true);
 const round=`${model.phase==='POST'?'Playoffs · ronda':'Semana'} ${model.week} · NFL ${model.season}`;
 ctx.fillStyle='#d9e5ce';text(ctx,round,pad,318,W-500,38);
 text(ctx,model.testMode?'SELECCIÓN DE PRUEBA · FUERA DE COMPETENCIA':model.complete?'MI SELECCIÓN GUARDADA':`SELECCIÓN INCOMPLETA · ${model.games.filter(g=>g.choice).length}/${model.games.length}`,pad,375,W-500,29,true);
 const scale=260/Math.max(mascot.width,mascot.height);ctx.drawImage(mascot,W-390,105,mascot.width*scale,mascot.height*scale);
 const top=485,bottom=H-235,rows=Math.ceil(model.games.length/2),rowH=Math.min(180,(bottom-top)/Math.max(1,rows));
 for(let i=0;i<model.games.length;i++){
  const g=model.games[i],col=i>=rows?1:0,index=i%rows,x=pad+col*(colW+gap),y=top+index*rowH;
  ctx.fillStyle=i%2?'#edf1df':'#ffffff';ctx.fillRect(x,y,colW,rowH-12);
  ctx.fillStyle='#59705e';text(ctx,String(i+1).padStart(2,'0'),x+20,y+38,50,25,true);
  const logo=58;ctx.drawImage(images[g.away],x+86,y+17,logo,logo);ctx.drawImage(images[g.home],x+colW-85,y+17,logo,logo);
  ctx.fillStyle='#142b30';text(ctx,`${g.away}  vs  ${g.home}`,x+160,y+55,colW-260,36,true);
  const chosen=g.choice==='TIE'?'EMPATE · TIE':g.choice?`${model.teams[g.choice]?.name||g.choice} · ${g.choice===g.away?'Visitante':'Local'}`:'SIN ELECCIÓN';
  ctx.fillStyle=g.choice?'#25543c':'#8a493b';text(ctx,chosen,x+25,y+rowH-34,colW-50,30,true);
 }
 ctx.fillStyle='#142b30';ctx.fillRect(pad,H-180,W-pad*2,3);
 text(ctx,'Visitante, local o TIE. Ganan las quinielas completas con más aciertos.',pad,H-125,W-pad*2,27);
 ctx.fillStyle='#59705e';text(ctx,'quiniela-fiscalizada.up.railway.app',pad,H-72,W-pad*2,29,true);
 return canvas;
}
const blobFrom=(canvas,type)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo preparar la descarga.')),type,.94));
export async function selectionFile(model,format){
 const canvas=await selectionCanvas(model,format);const jpg=await blobFrom(canvas,'image/jpeg');
 const safe=model.name.normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'participante';
 const filename=`quiniela-${model.season}-semana-${model.week}-${safe}.${format==='pdf'?'pdf':'jpg'}`;
 if(format==='pdf')return new File([jpegPdf(new Uint8Array(await jpg.arrayBuffer()),canvas.width,canvas.height)],filename,{type:'application/pdf'});
 return new File([jpg],filename,{type:'image/jpeg'});
}
export function downloadFile(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
