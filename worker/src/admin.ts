const ADMIN_USERNAME = 'wesley-and-dionne';
const PAGE_SIZE = 30;

type AdminMoment = {
  id: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  kind: 'photo' | 'video';
  caption: string;
  language: 'en' | 'zh';
  duration_seconds: number | null;
  received_at: string;
};

type DownloadMoment = AdminMoment & {
  object_key: string;
};

function securityHeaders(contentType: string) {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function safeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function decodeBasicCredentials(value: string) {
  try {
    const bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    );
    const decoded = new TextDecoder().decode(bytes);
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

async function isAuthorized(request: Request, env: Env) {
  if (!env.ADMIN_PASSWORD) return false;
  const authorization = request.headers.get('Authorization') || '';
  const [scheme, encoded] = authorization.split(' ', 2);
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return false;
  const credentials = decodeBasicCredentials(encoded);
  if (!credentials || credentials.username !== ADMIN_USERNAME) return false;
  return safeEqual(credentials.password, env.ADMIN_PASSWORD);
}

function challenge() {
  const headers = securityHeaders('text/plain; charset=utf-8');
  headers.set(
    'WWW-Authenticate',
    'Basic realm="Wedding media downloads", charset="UTF-8"',
  );
  return new Response('Sign in to view wedding media.', {
    status: 401,
    headers,
  });
}

function adminHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>Private Wedding Media | Wesley &amp; Dionne</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Literata:opsz,wght@7..72,400;7..72,600&family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;600&display=swap" rel="stylesheet" />
    <style>
      :root { color-scheme: light; --cream:#fff2e7; --light:#fff8f1; --red:#a9212a; --dark-red:#861922; --gold:#c9973e; --soft-gold:#deb86e; --brown:#3e2626; --muted:#765f5b; --english:"Cormorant Garamond",serif; --display:"Literata",serif; --chinese:"Ma Shan Zheng",cursive; --clarity:"Noto Serif SC",serif; }
      * { box-sizing:border-box; }
      html { background:var(--cream); -webkit-text-size-adjust:100%; }
      body { min-height:100vh; margin:0; color:var(--brown); background:radial-gradient(circle at 50% -10%,rgba(255,255,255,.9),transparent 34rem),var(--cream); font-family:var(--english); font-size:1.125rem; line-height:1.55; }
      button,a { min-height:44px; }
      button,a,h1,h2,p,span { overflow-wrap:anywhere; }
      :focus-visible { outline:3px solid var(--gold); outline-offset:3px; }
      .page { width:min(100% - 28px,960px); margin:0 auto; padding:max(24px,env(safe-area-inset-top)) 0 max(48px,env(safe-area-inset-bottom)); }
      .top { display:flex; justify-content:flex-end; margin-bottom:24px; }
      .language { border:1px solid rgba(201,151,62,.55); padding:8px 13px; color:var(--muted); background:rgba(255,248,241,.92); font-family:var(--clarity); cursor:pointer; }
      .language .active { color:var(--red); font-weight:600; }
      .hero { padding:clamp(28px,6vw,64px) clamp(18px,6vw,60px); text-align:center; background:rgba(255,248,241,.7); }
      .eyebrow { margin:0 0 10px; color:var(--red); font-family:var(--clarity); font-size:.78rem; letter-spacing:.16em; text-transform:uppercase; }
      h1 { max-width:780px; margin:0 auto; font-family:var(--display); font-size:clamp(2rem,7vw,4rem); font-weight:400; line-height:1.08; }
      .intro { max-width:620px; margin:18px auto 0; color:var(--muted); }
      .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:22px 0; }
      .summary-item { min-width:0; padding:18px; text-align:center; background:rgba(255,248,241,.72); }
      .summary-value { display:block; color:var(--red); font-family:var(--clarity); font-size:1.3rem; }
      .summary-label { color:var(--muted); font-size:.88rem; }
      .list { display:grid; gap:14px; }
      .moment { display:grid; grid-template-columns:minmax(190px,260px) minmax(0,1fr) auto; gap:18px; align-items:start; padding:18px; background:rgba(255,248,241,.78); border-left:2px solid var(--soft-gold); }
      .preview-column { min-width:0; }
      .media-preview { display:grid; width:100%; aspect-ratio:4/3; place-items:center; overflow:hidden; border:1px solid rgba(201,151,62,.42); background:#2f2422; }
      .media-preview img,.media-preview video { display:block; width:100%; height:100%; object-fit:contain; }
      .media-preview img { background:var(--light); }
      .video-compatibility { margin:8px 0 0; color:var(--muted); font-size:.78rem; line-height:1.4; }
      .details { min-width:0; }
      .kind { margin:0 0 4px; color:var(--red); font-family:var(--clarity); font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; }
      h2 { margin:0; font-family:var(--display); font-size:clamp(1.25rem,4vw,1.65rem); font-weight:400; }
      .meta,.caption { margin:6px 0 0; color:var(--muted); font-size:.9rem; }
      .download { display:grid; place-items:center; min-width:132px; border:1px solid var(--red); padding:9px 15px; color:#fff8f1; background:var(--red); font-weight:600; text-decoration:none; text-align:center; }
      .download:hover { background:var(--dark-red); }
      .empty,.error { padding:38px 20px; text-align:center; background:rgba(255,248,241,.72); }
      .error { color:var(--red); }
      .pager { display:flex; justify-content:center; align-items:center; gap:14px; margin-top:22px; }
      .pager button { border:1px solid var(--gold); padding:8px 14px; color:var(--brown); background:var(--light); cursor:pointer; }
      .pager button:disabled { cursor:not-allowed; opacity:.45; }
      .page-number { font-family:var(--clarity); font-size:.88rem; }
      html[lang="zh-Hans"] [data-i18n] { font-family:var(--chinese); }
      html[lang="zh-Hans"] .latin,html[lang="zh-Hans"] .number { font-family:var(--clarity); }
      @media (max-width:760px) { .moment { grid-template-columns:minmax(160px,220px) minmax(0,1fr); } .download { grid-column:2; width:100%; } }
      @media (max-width:640px) { .summary { grid-template-columns:1fr; } .moment { grid-template-columns:1fr; } .media-preview { max-height:70vh; } .download { grid-column:auto; width:100%; } }
      @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; } }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="top"><button class="language" id="language" type="button" aria-label="Switch language"><span class="active" data-language="en">EN</span><span aria-hidden="true"> / </span><span data-language="zh">中文</span></button></div>
      <section class="hero">
        <p class="eyebrow latin">Wesley &amp; Dionne · <span class="number">01.05.2027</span></p>
        <h1 data-i18n="title">Private wedding media</h1>
        <p class="intro" data-i18n="intro">Preview each moment here, then download each photograph or video individually. No ZIP file will be created.</p>
      </section>
      <section class="summary" aria-label="Upload summary">
        <div class="summary-item"><strong class="summary-value number" id="total-count">0</strong><span class="summary-label" data-i18n="moments">Moments</span></div>
        <div class="summary-item"><strong class="summary-value number" id="photo-count">0</strong><span class="summary-label" data-i18n="photos">Photographs</span></div>
        <div class="summary-item"><strong class="summary-value number" id="video-count">0</strong><span class="summary-label" data-i18n="videos">Videos</span></div>
      </section>
      <section class="list" id="list" aria-live="polite"><div class="empty" data-i18n="loading">Loading your wedding media…</div></section>
      <nav class="pager" aria-label="Media pages">
        <button id="previous" type="button" data-i18n="previous">Previous</button>
        <span class="page-number" id="page-number">1 / 1</span>
        <button id="next" type="button" data-i18n="next">Next</button>
      </nav>
    </main>
    <script>
      const translations={en:{title:"Private wedding media",intro:"Preview each moment here, then download each photograph or video individually. No ZIP file will be created.",moments:"Moments",photos:"Photographs",videos:"Videos",loading:"Loading your wedding media…",empty:"No photographs or videos have been received yet.",error:"The media list could not be loaded. Please refresh the page.",photo:"Photograph",video:"Video",photoPreview:"Photograph preview",videoPreview:"Video preview",videoCompatibility:"If this MOV video stays at 0:00, open this admin page in Safari or download the video.",download:"Download",previous:"Previous",next:"Next",page:"Page",of:"of",seconds:"seconds"},zh:{title:"私人婚礼媒体",intro:"你可以在这里预览每个瞬间，并逐一下载照片或视频，不会建立 ZIP 文件。",moments:"瞬间",photos:"照片",videos:"视频",loading:"正在载入婚礼媒体…",empty:"目前还没有收到照片或视频。",error:"无法载入媒体列表，请刷新页面。",photo:"照片",video:"视频",photoPreview:"照片预览",videoPreview:"视频预览",videoCompatibility:"如果 MOV 视频停留在 0:00，请使用 Safari 打开此管理页面，或下载视频观看。",download:"下载",previous:"上一页",next:"下一页",page:"第",of:"页，共",seconds:"秒"}};
      let language="en";let page=1;let data=null;
      const t=(key)=>translations[language][key];
      const formatBytes=(bytes)=>{if(bytes<1024)return bytes+" B";if(bytes<1048576)return(bytes/1024).toFixed(1)+" KB";return(bytes/1048576).toFixed(1)+" MB";};
      const formatDate=(value)=>new Intl.DateTimeFormat(language==="zh"?"zh-CN":"en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(value));
      function applyLanguage(next){language=next;document.documentElement.lang=next==="zh"?"zh-Hans":"en";document.querySelectorAll("[data-i18n]").forEach((element)=>{element.textContent=t(element.dataset.i18n);});document.querySelectorAll("[data-language]").forEach((element)=>element.classList.toggle("active",element.dataset.language===next));document.querySelector("#language").setAttribute("aria-label",next==="zh"?"切换语言":"Switch language");render();}
      function render(){if(!data)return;document.querySelector("#total-count").textContent=data.summary.total;document.querySelector("#photo-count").textContent=data.summary.photos;document.querySelector("#video-count").textContent=data.summary.videos;const list=document.querySelector("#list");list.replaceChildren();if(!data.items.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=t("empty");list.appendChild(empty);}for(const item of data.items){const card=document.createElement("article");card.className="moment";const previewColumn=document.createElement("div");previewColumn.className="preview-column";const previewWrap=document.createElement("div");previewWrap.className="media-preview";const preview=document.createElement(item.kind==="photo"?"img":"video");preview.src="/api/admin/moments/"+encodeURIComponent(item.id)+"/preview";if(item.kind==="photo"){preview.loading="lazy";preview.alt=t("photoPreview")+": "+item.original_name;}else{preview.controls=true;preview.preload="metadata";preview.playsInline=true;preview.setAttribute("aria-label",t("videoPreview")+": "+item.original_name);}previewWrap.appendChild(preview);previewColumn.appendChild(previewWrap);if(item.kind==="video"&&item.content_type==="video/quicktime"){const compatibility=document.createElement("p");compatibility.className="video-compatibility";compatibility.textContent=t("videoCompatibility");previewColumn.appendChild(compatibility);}const details=document.createElement("div");details.className="details";const kind=document.createElement("p");kind.className="kind";kind.textContent=t(item.kind);const title=document.createElement("h2");title.textContent=item.original_name;const meta=document.createElement("p");meta.className="meta";const seconds=Number(item.duration_seconds);const duration=Number.isFinite(seconds)&&seconds>0?" · "+seconds.toFixed(1).replace(/\\.0$/,"")+" "+t("seconds"):"";meta.textContent=formatDate(item.received_at)+" · "+formatBytes(item.size_bytes)+duration;details.append(kind,title,meta);if(item.caption){const caption=document.createElement("p");caption.className="caption";caption.textContent=item.caption;details.appendChild(caption);}const download=document.createElement("a");download.className="download";download.href="/api/admin/moments/"+encodeURIComponent(item.id)+"/download";download.textContent=t("download");download.setAttribute("download","");card.append(previewColumn,details,download);list.appendChild(card);}document.querySelector("#page-number").textContent=language==="zh"?t("page")+data.page+t("of")+data.totalPages+"页":t("page")+" "+data.page+" "+t("of")+" "+data.totalPages;document.querySelector("#previous").disabled=data.page<=1;document.querySelector("#next").disabled=data.page>=data.totalPages;}
      async function load(){const list=document.querySelector("#list");try{const response=await fetch("/api/admin/moments?page="+page);if(!response.ok)throw new Error();data=await response.json();render();}catch{list.innerHTML="";const error=document.createElement("div");error.className="error";error.textContent=t("error");list.appendChild(error);}}
      document.querySelector("#language").addEventListener("click",()=>applyLanguage(language==="en"?"zh":"en"));document.querySelector("#previous").addEventListener("click",()=>{if(page>1){page-=1;load();}});document.querySelector("#next").addEventListener("click",()=>{if(data&&page<data.totalPages){page+=1;load();}});applyLanguage("en");load();
    </script>
  </body>
</html>`;
}

function safeDownloadName(value: string) {
  const cleaned = value.replace(/[\r\n"\\/]/g, '_').trim();
  return cleaned || 'wedding-moment';
}

async function findMoment(id: string, env: Env) {
  return env.DB.prepare(
    `SELECT id, object_key, original_name, content_type, size_bytes, kind,
      caption, language, duration_seconds, received_at
     FROM moments WHERE id = ?1 AND status = 'stored' LIMIT 1`,
  )
    .bind(id)
    .first<DownloadMoment>();
}

function returnedRange(range: R2Range, total: number) {
  if ('suffix' in range) {
    const length = Math.min(range.suffix, total);
    return { offset: total - length, length };
  }
  const offset = range.offset || 0;
  const length = Math.min(range.length ?? total - offset, total - offset);
  return { offset, length };
}

async function listMoments(request: Request, env: Env) {
  const requestedPage = Number(new URL(request.url).searchParams.get('page') || '1');
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 50)
    : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const [itemsResult, summary] = await Promise.all([
    env.DB.prepare(
      `SELECT id, original_name, content_type, size_bytes, kind, caption,
        language, duration_seconds, received_at
       FROM moments WHERE status = 'stored'
       ORDER BY received_at DESC LIMIT ?1 OFFSET ?2`,
    )
      .bind(PAGE_SIZE, offset)
      .all<AdminMoment>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN kind = 'photo' THEN 1 ELSE 0 END) AS photos,
        SUM(CASE WHEN kind = 'video' THEN 1 ELSE 0 END) AS videos
       FROM moments WHERE status = 'stored'`,
    ).first<{ total: number; photos: number | null; videos: number | null }>(),
  ]);
  const total = summary?.total || 0;
  return Response.json(
    {
      items: itemsResult.results,
      summary: {
        total,
        photos: summary?.photos || 0,
        videos: summary?.videos || 0,
      },
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
    { headers: securityHeaders('application/json; charset=utf-8') },
  );
}

async function serveMoment(
  request: Request,
  id: string,
  env: Env,
  disposition: 'attachment' | 'inline',
) {
  const moment = await findMoment(id, env);
  if (!moment) {
    return new Response('Media not found.', {
      status: 404,
      headers: securityHeaders('text/plain; charset=utf-8'),
    });
  }

  const rangeHeader = disposition === 'inline'
    ? request.headers.get('Range')
    : null;
  const rangeHeaders = new Headers();
  if (rangeHeader) rangeHeaders.set('Range', rangeHeader);
  const object = await env.MEDIA.get(
    moment.object_key,
    rangeHeader ? { range: rangeHeaders } : undefined,
  );
  if (!object) {
    return new Response('Stored media is unavailable.', {
      status: 404,
      headers: securityHeaders('text/plain; charset=utf-8'),
    });
  }

  const filename = safeDownloadName(moment.original_name);
  const headers = securityHeaders(moment.content_type);
  headers.set('Accept-Ranges', 'bytes');
  headers.set(
    'Content-Disposition',
    `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  headers.set('ETag', object.httpEtag);
  let status = 200;
  if (object.range) {
    const range = returnedRange(object.range, moment.size_bytes);
    headers.set('Content-Length', String(range.length));
    headers.set(
      'Content-Range',
      `bytes ${range.offset}-${range.offset + range.length - 1}/${moment.size_bytes}`,
    );
    status = 206;
  } else {
    headers.set('Content-Length', String(moment.size_bytes));
  }
  return new Response(object.body, { status, headers });
}

export async function handleAdminRequest(request: Request, env: Env) {
  if (!env.ADMIN_PASSWORD) {
    return new Response('Admin access is not configured.', {
      status: 503,
      headers: securityHeaders('text/plain; charset=utf-8'),
    });
  }
  if (!(await isAuthorized(request, env))) return challenge();

  const url = new URL(request.url);
  if (request.method !== 'GET') {
    return new Response('Method not allowed.', {
      status: 405,
      headers: securityHeaders('text/plain; charset=utf-8'),
    });
  }
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const headers = securityHeaders('text/html; charset=utf-8');
    headers.set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self'; media-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    return new Response(adminHtml(), { headers });
  }
  if (url.pathname === '/api/admin/moments') {
    return listMoments(request, env);
  }
  const match = url.pathname.match(
    /^\/api\/admin\/moments\/([0-9a-f-]{36})\/download$/i,
  );
  if (match) return serveMoment(request, match[1], env, 'attachment');
  const previewMatch = url.pathname.match(
    /^\/api\/admin\/moments\/([0-9a-f-]{36})\/preview$/i,
  );
  if (previewMatch) return serveMoment(request, previewMatch[1], env, 'inline');

  return new Response('Not found.', {
    status: 404,
    headers: securityHeaders('text/plain; charset=utf-8'),
  });
}
