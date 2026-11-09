const { PDFDocument } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const pagesEl = document.getElementById('pages');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const info = document.getElementById('info');
const toast = document.getElementById('toast');

let pages = []; // {srcDoc, pageIndex, thumbUrl, selected}
let totalSize = 0;

function showToast(msg){ toast.textContent=msg; toast.hidden=false; setTimeout(()=>toast.hidden=true,3000); }
function setProgress(p,t){ progressWrap.hidden=false; progressBar.style.width=p+'%'; progressText.textContent=t; if(p>=100) setTimeout(()=>progressWrap.hidden=true,600); }

dropzone.addEventListener('click',()=>fileInput.click());
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.style.borderColor='#6af';});
dropzone.addEventListener('dragleave',()=>dropzone.style.borderColor='');
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.style.borderColor=''; handleFiles(e.dataTransfer.files);});
fileInput.addEventListener('change',e=>handleFiles(e.target.files));

async function handleFiles(files){
  const arr = Array.from(files).filter(f=>f.type==='application/pdf');
  for(const f of arr){
    totalSize += f.size;
    const buf = await f.arrayBuffer();
    const data = new Uint8Array(buf);
    const pdf = await pdfjsLib.getDocument({data}).promise;
    const srcPdf = await PDFDocument.load(buf);
    for(let i=0;i<pdf.numPages;i++){
      const page = await pdf.getPage(i+1);
      const vp = page.getViewport({scale:0.3});
      const canvas = document.createElement('canvas');
      canvas.width=vp.width; canvas.height=vp.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      pages.push({srcBuf:buf, srcDoc:srcPdf, pageIndex:i, thumb:canvas.toDataURL(), selected:false});
    }
  }
  renderPages();
  info.textContent = `Pages: ${pages.length} | Original size: ${(totalSize/1024/1024).toFixed(2)} MB`;
}

function renderPages(){
  pagesEl.innerHTML='';
  pages.forEach((p,idx)=>{
    const div=document.createElement('div');
    div.className='page'+(p.selected?' selected':'');
    div.draggable=true;
    div.innerHTML=`<img src="${p.thumb}"/><button class="del">×</button><div style="font-size:11px;margin-top:4px">p${p.pageIndex+1}</div>`;
    div.querySelector('.del').onclick=()=>{pages.splice(idx,1);renderPages();};
    div.onclick=(e)=>{ if(e.target.classList.contains('del'))return; p.selected=!p.selected; renderPages();};
    div.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',idx));
    div.addEventListener('drop',e=>{e.preventDefault();const from=+e.dataTransfer.getData('text/plain');const [m]=pages.splice(from,1);pages.splice(idx,0,m);renderPages();});
    div.addEventListener('dragover',e=>e.preventDefault());
    pagesEl.appendChild(div);
  });
}

document.getElementById('clearBtn').onclick=()=>{pages=[];totalSize=0;renderPages();info.textContent='';};

document.getElementById('mergeBtn').onclick=async()=>{
  if(!pages.length){showToast('No pages');return;}
  setProgress(10,'Building PDF...');
  const out = await PDFDocument.create();
  for(let i=0;i<pages.length;i++){
    const [copied]=await out.copyPages(pages[i].srcDoc,[pages[i].pageIndex]);
    out.addPage(copied);
    setProgress(10+80*i/pages.length,'Merging...');
  }
  // compression via re-save with object streams
  const bytes = await out.save({useObjectStreams:true});
  download(bytes,'merged.pdf');
  setProgress(100,'Done');
  info.textContent += ` | Output: ${(bytes.length/1024/1024).toFixed(2)} MB`;
  showToast('Merged PDF downloaded');
};

document.getElementById('splitBtn').onclick=async()=>{
  const sel = pages.filter(p=>p.selected);
  if(!sel.length){showToast('Select pages first');return;}
  const out = await PDFDocument.create();
  for(const p of sel){const [c]=await out.copyPages(p.srcDoc,[p.pageIndex]);out.addPage(c);}
  const bytes = await out.save({useObjectStreams:true});
  download(bytes,'split.pdf');
  showToast('Split PDF downloaded');
};

function download(bytes,name){
  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;a.click();
  URL.revokeObjectURL(url);
}