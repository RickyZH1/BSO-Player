export const lines=[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];
export function qualify(positions){const s=new Set(positions);return {first:s.size>=5&&lines.some(l=>l.every(p=>s.has(p))),full:s.size===9};}
export function csv(rows){return '\uFEFF'+rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export async function compress(file){
 if(!/^image\/(jpeg|webp|png)$/.test(file.type))throw Error('请选择JPEG、WebP或PNG照片（HEIC请先转JPEG）');
 if(file.size>25*1024*1024)throw Error('原图过大，请选择小于25MB的照片');
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.7,.58,.45,.3]){const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<=800000)return blob;}
  throw Error('压缩后仍超过800KB，请选取较小照片');
 }finally{bitmap.close();}
}
