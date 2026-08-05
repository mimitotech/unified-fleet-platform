import{h as f,E as g}from"./jspdf.es.min-C10k8LzI.js";import"./index-DKm2rPlq.js";import"./leaflet-CV0MAgsw.js";async function j(n){const{root:o,title:a,primaryColor:t="#004225",secondaryColor:p="#0f172a",mode:e="both",chartSourceRoot:r,filename:i}=n,s=await u(r||o),l=o.cloneNode(!0);x(l,s);const{maxColumns:d,landscape:m}=z(l);await b(l);const c=w(l,{title:a,primaryColor:t,secondaryColor:p,maxColumns:d,landscape:m}),h=(i==null?void 0:i.replace(/\.pdf$/i,""))||C(a);(e==="download"||e==="both")&&await A(c,h,m),(e==="print"||e==="both")&&await S(c)}async function u(n){const o=Array.from(n.querySelectorAll("[data-report-chart-card]"));if(!o.length)return[];const a=Array.from(n.querySelectorAll(".recharts-tooltip-wrapper, [data-no-print]")),t=a.map(e=>({el:e,visibility:e.style.visibility,display:e.style.display}));a.forEach(e=>{e.matches("[data-no-print]")?e.style.display="none":e.style.visibility="hidden"});const p=y(o);try{window.dispatchEvent(new Event("resize")),await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))),await new Promise(r=>setTimeout(r,220));const e=[];for(const r of o){const i=r.getBoundingClientRect(),s=Math.max(Math.ceil(i.width),r.offsetWidth,480),l=Math.max(Math.ceil(i.height),r.offsetHeight,260);if(s<8||l<8){e.push("");continue}const d=await f(r,{scale:2.5,useCORS:!0,logging:!1,backgroundColor:"#ffffff",width:s,height:l,windowWidth:Math.max(document.documentElement.clientWidth,s+80)});e.push(d.toDataURL("image/png"))}return e}finally{p(),t.forEach(({el:e,visibility:r,display:i})=>{e.style.visibility=r,e.style.display=i})}}function y(n){const o=[],a=(t,p)=>{const e={};for(const r of Object.keys(p))e[r]=t.style.getPropertyValue(r);for(const[r,i]of Object.entries(p))i!=null&&t.style.setProperty(r,String(i));o.push(()=>{for(const[r,i]of Object.entries(e))i?t.style.setProperty(r,i):t.style.removeProperty(r)})};for(const t of n){a(t,{"box-sizing":"border-box",padding:"16px",width:"560px","max-width":"560px","min-width":"560px","min-height":"360px"}),t.querySelectorAll("[data-report-chart-title] p").forEach((e,r)=>{r===0?a(e,{"font-size":"13px","line-height":"1.3","font-weight":"650",color:"#0f172a",margin:"0"}):a(e,{"font-size":"11px","line-height":"1.35",color:"#475569","margin-top":"4px"})});const p=t.querySelector("[data-report-chart-body]");p&&a(p,{"min-height":"0",height:"auto",overflow:"visible"}),t.querySelectorAll("[data-chart]").forEach(e=>{a(e,{height:"280px","min-height":"280px","max-height":"280px",width:"100%","aspect-ratio":"auto",overflow:"visible"})}),t.querySelectorAll("[data-report-chart-legend]").forEach(e=>{a(e,{display:"flex","flex-wrap":"wrap","justify-content":"center","align-items":"center",gap:"8px 14px","padding-top":"10px","font-size":"11px","line-height":"1.35",color:"#334155",width:"100%",height:"auto",overflow:"visible"}),e.querySelectorAll("span").forEach(r=>{r.getAttribute("aria-hidden")==null&&a(r,{"font-size":"11px",color:"#334155","white-space":"nowrap"})})}),t.querySelectorAll(".recharts-legend-wrapper").forEach(e=>{a(e,{"font-size":"11px","line-height":"1.35","padding-top":"8px",height:"auto",position:"relative",width:"100%"})}),t.querySelectorAll(".recharts-legend-item-text, .recharts-default-legend").forEach(e=>{a(e,{"font-size":"11px",color:"#334155"})}),t.querySelectorAll('[class*="text-[8px]"], [class*="text-[9px]"]').forEach(e=>{a(e,{"font-size":"11px",gap:"8px"})}),t.querySelectorAll("text").forEach(e=>{const r=e.getAttribute("font-size"),i=e.getAttribute("fill");o.push(()=>{r==null?e.removeAttribute("font-size"):e.setAttribute("font-size",r),i==null?e.removeAttribute("fill"):e.setAttribute("fill",i)}),Number(r||8)<=9&&(e.setAttribute("font-size","11"),(!i||i==="#64748b"||i==="#475569")&&e.setAttribute("fill","#475569"))})}return()=>{for(let t=o.length-1;t>=0;t--)o[t]()}}function x(n,o){const a=Array.from(n.querySelectorAll("[data-report-chart-card]"));a.forEach((t,p)=>{const e=o[p];if(!e)return;t.innerHTML="",t.style.minHeight="250px",t.style.overflow="visible",t.style.padding="10px";const r=document.createElement("img");r.src=e,r.alt="",r.setAttribute("data-report-chart-img",""),r.style.display="block",r.style.width="100%",r.style.height="auto",r.style.maxWidth="100%",r.style.objectFit="contain",t.appendChild(r)}),a.length||Array.from(n.querySelectorAll("[data-report-chart-body]")).forEach((p,e)=>{const r=o[e];if(!r)return;p.innerHTML="";const i=document.createElement("img");i.src=r,i.alt="",i.setAttribute("data-report-chart-img",""),i.style.display="block",i.style.width="100%",i.style.height="auto",p.appendChild(i)})}async function b(n){const o=Array.from(n.querySelectorAll("img"));await Promise.all(o.map(async a=>{const t=a.getAttribute("src");if(!(!t||t.startsWith("data:")))try{const p=await fetch(t,{credentials:"include"});if(!p.ok)return;const e=await p.blob(),r=await new Promise((i,s)=>{const l=new FileReader;l.onload=()=>i(String(l.result)),l.onerror=s,l.readAsDataURL(e)});a.setAttribute("src",r)}catch{}}))}function w(n,o){const{title:a,primaryColor:t,secondaryColor:p,maxColumns:e,landscape:r}=o,i=E(e),s=r?"A4 landscape":"A4 portrait";return`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${q(a)}</title>
  <style>${v({primaryColor:t,secondaryColor:p,tableFontPx:i,maxColumns:e,pageSize:s})}</style>
</head>
<body>
  <div class="report-sheet">
${n.outerHTML}
  </div>
</body>
</html>`}function v(n){const{primaryColor:o,secondaryColor:a,tableFontPx:t,maxColumns:p,pageSize:e}=n,r=p>12?"2px 3px":p>8?"3px 4px":"5px 6px";return`
    @page { size: ${e}; margin: 8mm 6mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: ${a};
      margin: 0;
      padding: 0;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-sheet { max-width: 1100px; margin: 0 auto; padding: 8px 4px 16px; }
    [data-report-document] { position: relative; background: #fff; }
    [data-report-watermark] {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0; overflow: hidden;
    }
    [data-report-watermark-img] {
      width: 58% !important; max-width: 440px !important; max-height: none !important;
      height: auto !important; opacity: 0.07 !important; transform: rotate(-24deg);
      object-fit: contain !important;
    }
    [data-report-content] { position: relative; z-index: 1; }
    .print-table-wrap { width: 100%; overflow: visible; }
    table {
      width: 100% !important; min-width: 0 !important; max-width: 100% !important;
      border-collapse: collapse; font-size: ${t}px; margin-top: 4px;
      table-layout: ${p>=10?"auto":"fixed"};
    }
    th, td {
      border: 1px solid #e2e8f0; padding: ${r}; vertical-align: top;
      white-space: normal !important; word-break: break-word; overflow-wrap: break-word;
      hyphens: auto; line-height: 1.3; max-width: none;
    }
    th {
      background: ${o}; color: #fff; text-align: left; font-weight: 600;
      white-space: normal !important;
    }
    td { color: #000 !important; }
    tr:nth-child(even) td { background: #f8fafc; }
    [data-report-header] {
      border: 1px solid #e2e8f0; background: rgba(255,255,255,0.97);
      page-break-inside: avoid; margin-bottom: 8px;
    }
    [data-report-header-bar] { height: 6px; background: ${o}; }
    [data-report-header-body] {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 12px 28px; padding: 16px 22px;
    }
    [data-report-brand] { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
    [data-report-logo] {
      width: 64px !important; height: 64px !important; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      padding: 6px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
    }
    [data-report-logo] img {
      max-height: 58px !important; max-width: 160px !important;
      width: auto !important; height: auto !important; object-fit: contain !important;
    }
    [data-report-client-name] {
      font-size: 18px; font-weight: 600; line-height: 1.2;
      white-space: nowrap; color: ${o};
    }
    [data-report-divider] { width: 1px; height: 48px; background: #e2e8f0; flex-shrink: 0; }
    [data-report-title-block] {
      display: flex; flex-direction: column; gap: 4px;
      min-width: 12rem !important; flex: 1 1 200px; flex-shrink: 0;
      overflow: visible !important;
    }
    [data-report-title],
    [data-report-title-block] p:first-child {
      margin: 0; font-size: 16px; font-weight: 600; color: #1e293b;
      white-space: normal !important; word-break: break-word;
      overflow: visible !important; max-width: none !important;
    }
    [data-report-title-block] p + p { font-size: 12px; font-weight: 400; color: #64748b; }
    [data-report-header] { overflow: visible !important; }
    [data-report-header-body] { overflow: visible !important; flex-wrap: wrap !important; }
    [data-report-meta] {
      display: flex; flex-wrap: wrap; align-items: center;
      gap: 6px 18px; margin-left: auto; font-size: 11px;
    }
    [data-report-meta-item] span:first-child { color: #94a3b8; font-weight: 500; }
    [data-report-meta-item] span:last-child { color: #334155; }
    [data-report-footer] {
      border: 1px solid #e2e8f0; border-top: none; background: rgba(255,255,255,0.97);
      page-break-inside: avoid; margin-top: 8px; padding: 12px 24px;
    }
    [data-report-footer-top] {
      display: flex; flex-wrap: wrap; align-items: center;
      justify-content: space-between; gap: 12px;
    }
    [data-report-footer-note] { margin: 0; font-size: 10px; color: #475569; line-height: 1.4; }
    [data-report-footer-ref] { margin: 0; font-size: 10px; color: #94a3b8; }
    [data-report-footer-powered] {
      display: flex; align-items: center; gap: 8px; margin-top: 10px;
      padding-top: 10px; border-top: 1px solid #e2e8f0;
    }
    [data-report-footer-powered-label] {
      margin: 0; font-size: 10px; color: #64748b; white-space: nowrap;
    }
    [data-report-footer-powered-logo] {
      height: 22px !important; width: auto !important; max-width: 72px !important;
      object-fit: contain !important;
    }
    [data-report-footer-powered-name] {
      margin: 0; font-size: 10px; font-weight: 600; color: #004225; white-space: nowrap;
    }

    /* KPI strip — match on-screen preview sizes */
    [data-report-kpi-grid] {
      display: grid !important;
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 10px !important;
      width: 100% !important;
      margin: 0 0 10px !important;
      page-break-inside: avoid;
    }
    [data-report-kpi-grid][data-report-kpi-count="1"] { grid-template-columns: 1fr !important; }
    [data-report-kpi-grid][data-report-kpi-count="2"] { grid-template-columns: 1fr 1fr !important; }
    [data-report-kpi-grid][data-report-kpi-count="3"] { grid-template-columns: 1fr 1fr 1fr !important; }
    [data-report-kpi-card] {
      display: block !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 6px !important;
      background: #f8fafc !important;
      padding: 12px !important;
      min-width: 0 !important;
      page-break-inside: avoid;
    }
    [data-report-kpi-label] {
      display: block !important;
      font-size: 11px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
      color: #64748b !important;
      margin: 0 !important;
    }
    [data-report-kpi-value] {
      display: block !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      color: ${o} !important;
      margin: 4px 0 0 !important;
      font-variant-numeric: tabular-nums;
    }
    [data-report-kpi-hint] {
      display: block !important;
      font-size: 10px !important;
      color: #94a3b8 !important;
      margin: 2px 0 0 !important;
    }

    /* Charts — 2 per row; clear spacing from title / table */
    [data-report-chart-grid] {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 14px !important;
      width: 100% !important;
      margin: 24px 0 !important;
    }
    [data-report-chart-card] {
      display: flex !important;
      flex-direction: column !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      background: rgba(248, 250, 252, 0.55) !important;
      padding: 14px !important;
      min-height: 250px !important;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    [data-report-chart-card][data-report-chart-span="2"] {
      grid-column: 1 / -1 !important;
    }
    [data-report-chart-title] p {
      margin: 0 !important;
    }
    [data-report-chart-title] p:first-child {
      font-size: 12px !important;
      font-weight: 650 !important;
      color: #0f172a !important;
      line-height: 1.3 !important;
    }
    [data-report-chart-title] p + p {
      font-size: 10px !important;
      font-weight: 400 !important;
      color: #475569 !important;
      margin-top: 3px !important;
      line-height: 1.35 !important;
    }
    [data-report-chart-body] {
      flex: 0 0 auto !important;
      min-height: 0 !important;
      width: 100% !important;
      overflow: visible !important;
    }
    [data-report-chart-img] {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      max-width: 100% !important;
      object-fit: contain !important;
    }

    /* Heatmap leftover styles (usually replaced by chart snapshot) */
    [data-report-heatmap] { width: 100% !important; overflow: visible !important; }
    [data-report-heatmap] table {
      width: 100% !important;
      border-collapse: collapse !important;
      table-layout: fixed !important;
      font-size: 9px !important;
      margin: 0 !important;
    }
    [data-report-heatmap] th,
    [data-report-heatmap] td {
      border: none !important;
      background: transparent !important;
      padding: 2px !important;
      line-height: 1.2 !important;
      vertical-align: middle !important;
    }
    [data-report-heatmap] th {
      color: #64748b !important;
      font-weight: 500 !important;
      font-size: 8px !important;
      text-align: center !important;
    }
    [data-report-heatmap] th:first-child { text-align: left !important; }
    [data-report-heatmap] td {
      color: #334155 !important;
      font-size: 8px !important;
    }
    [data-report-heatmap] tr:nth-child(even) td { background: transparent !important; }

    button, [data-no-print] { display: none !important; }
    h1, h2, h3 { margin: 0; }
    @media print {
      html, body { width: 100%; height: auto; overflow: visible; }
      body { padding: 0; }
      .report-sheet { max-width: none; width: 100%; padding: 0; }
      .print-table-wrap { overflow: visible !important; max-height: none !important; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
    }
  `}async function k(n){var e;const o=document.createElement("iframe");o.setAttribute("title","Report export"),o.style.cssText="position:fixed;left:-10000px;top:0;width:1100px;height:10px;border:0;visibility:hidden",document.body.appendChild(o);const a=o.contentDocument||((e=o.contentWindow)==null?void 0:e.document);if(!a)throw o.remove(),new Error("Could not create export frame");a.open(),a.write(n),a.close(),await new Promise(r=>{var i;((i=o.contentDocument)==null?void 0:i.readyState)==="complete"?r():o.onload=()=>r()});const t=Array.from(a.images||[]);await Promise.all(t.map(r=>r.complete?Promise.resolve():new Promise(i=>{r.onload=()=>i(),r.onerror=()=>i()}))),await new Promise(r=>setTimeout(r,150));const p=a.querySelector(".report-sheet");if(!p)throw o.remove(),new Error("Report layout missing");return o.style.height=`${Math.max(p.scrollHeight+40,400)}px`,{iframe:o,sheet:p,cleanup:()=>o.remove()}}async function A(n,o,a){const{sheet:t,cleanup:p}=await k(n);try{const e=await f(t,{scale:2,useCORS:!0,logging:!1,backgroundColor:"#ffffff",windowWidth:t.scrollWidth,width:t.scrollWidth,height:t.scrollHeight}),r=new g({orientation:a?"landscape":"portrait",unit:"mm",format:"a4"}),i=r.internal.pageSize.getWidth(),s=r.internal.pageSize.getHeight(),l=i,d=e.height*l/e.width,m=e.toDataURL("image/jpeg",.92);let c=d,h=0;for(r.addImage(m,"JPEG",0,h,l,d),c-=s;c>0;)h=c-d,r.addPage(),r.addImage(m,"JPEG",0,h,l,d),c-=s;r.save(`${o}.pdf`)}finally{p()}}async function S(n){var e,r;const o=document.createElement("iframe");o.setAttribute("title","Print report"),o.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none",document.body.appendChild(o);const a=o.contentDocument||((e=o.contentWindow)==null?void 0:e.document);if(!a){o.remove();return}a.open(),a.write(n),a.close();const t=()=>{var i,s;try{(i=o.contentWindow)==null||i.focus(),(s=o.contentWindow)==null||s.print()}finally{setTimeout(()=>o.remove(),1500)}},p=async()=>{const i=Array.from(a.images||[]);await Promise.all(i.map(s=>s.complete?Promise.resolve():new Promise(l=>{s.onload=()=>l(),s.onerror=()=>l()}))),setTimeout(t,200)};((r=o.contentDocument)==null?void 0:r.readyState)==="complete"?p():o.onload=()=>{p()}}function z(n){let o=0;return n.querySelectorAll("div").forEach(a=>{const t=a,p=t.className||"";t.querySelector(":scope > table")!=null&&(p.includes("overflow-auto")||p.includes("overflow-x-auto")||/\bmax-h-/.test(p))&&(t.style.overflow="visible",t.style.maxHeight="none",t.style.maxWidth="none")}),n.querySelectorAll("[data-report-kpi-grid]").forEach(a=>{const t=a,p=Math.min(Number(t.getAttribute("data-report-kpi-count")||"4")||4,4);t.style.display="grid",t.style.gridTemplateColumns=`repeat(${p}, minmax(0, 1fr))`,t.style.gap="10px",t.style.width="100%"}),n.querySelectorAll("[data-report-kpi-card]").forEach(a=>{const t=a;t.style.display="block",t.style.minWidth="0",t.style.border="1px solid #e2e8f0",t.style.borderRadius="6px",t.style.background="#f8fafc",t.style.padding="12px"}),n.querySelectorAll("[data-report-chart-grid]").forEach(a=>{const t=a;t.style.display="grid",t.style.gridTemplateColumns="1fr 1fr",t.style.gap="14px",t.style.width="100%",t.style.marginTop="24px",t.style.marginBottom="24px"}),n.querySelectorAll("[data-report-chart-card]").forEach(a=>{const t=a;t.style.display="flex",t.style.flexDirection="column",t.style.minHeight="250px",t.style.border="1px solid #e2e8f0",t.style.borderRadius="8px",t.style.background="rgba(248, 250, 252, 0.55)",t.style.padding="14px",t.style.pageBreakInside="avoid",t.style.breakInside="avoid",t.getAttribute("data-report-chart-span")==="2"&&(t.style.gridColumn="1 / -1")}),n.querySelectorAll("[data-report-chart-body]").forEach(a=>{const t=a;t.style.overflow="visible"}),n.querySelectorAll(".recharts-tooltip-wrapper").forEach(a=>a.remove()),n.querySelectorAll("[data-report-chart-img]").forEach(a=>{const t=a;t.style.display="block",t.style.width="100%",t.style.height="auto",t.style.maxWidth="100%",t.style.objectFit="contain"}),n.querySelectorAll("[data-report-logo] img").forEach(a=>{const t=a;t.style.maxHeight="58px",t.style.maxWidth="160px",t.style.width="auto",t.style.height="auto",t.style.objectFit="contain"}),n.querySelectorAll("[data-report-watermark-img]").forEach(a=>{const t=a;t.style.maxHeight="none",t.style.maxWidth="440px",t.style.width="58%",t.style.opacity="0.07",t.style.transform="rotate(-24deg)",t.style.objectFit="contain"}),n.querySelectorAll("table").forEach(a=>{const t=a;if(t.closest("[data-report-heatmap]"))return;const p=t.parentElement;if(p&&!p.classList.contains("print-table-wrap")){const l=document.createElement("div");l.className="print-table-wrap",p.insertBefore(l,t),l.appendChild(t)}t.removeAttribute("style");const e=t.querySelectorAll("thead tr:first-child th").length,r=t.querySelectorAll("tbody tr:first-child td").length,i=Math.max(e,r,1);o=Math.max(o,i);const s=i>=10?void 0:`${(100/i).toFixed(3)}%`;t.querySelectorAll("thead th").forEach(l=>{s?l.style.width=s:l.style.width="auto",l.style.minWidth=i>=10?"64px":"0"}),t.querySelectorAll("th, td").forEach(l=>{const d=l;d.style.whiteSpace="normal",d.style.wordBreak="break-word",d.style.overflowWrap="break-word",d.classList.remove("whitespace-nowrap")})}),{maxColumns:o,landscape:o>=7}}function E(n){return n>=18?8:n>=14?9:n>=11?10:n>=8?11:13}function q(n){return n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function C(n){return n.replace(/[^\w\-]+/g,"_").replace(/_+/g,"_").slice(0,80)||"report"}export{j as printReportDocument};
