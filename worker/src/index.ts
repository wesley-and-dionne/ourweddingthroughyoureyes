const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 50;
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/quicktime', 'mov'],
  ['video/webm', 'webm'],
]);

type ApiBody = Record<string, unknown>;

type TurnstileResult = {
  success: boolean;
  hostname?: string;
};

function allowedOrigins(env: Env) {
  return new Set(
    env.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsHeaders(request: Request, env: Env) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function json(request: Request, env: Env, body: ApiBody, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders(request, env),
  });
}

function originIsAllowed(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  return Boolean(origin && allowedOrigins(env).has(origin));
}

function validDeviceId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function hashDeviceId(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function validateTurnstile(
  token: string,
  request: Request,
  env: Env,
) {
  if (!env.TURNSTILE_SECRET_KEY) return false;

  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  body.set('idempotency_key', crypto.randomUUID());
  const remoteIp = request.headers.get('CF-Connecting-IP');
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    body,
  });
  if (!response.ok) return false;

  const result = await response.json<TurnstileResult>();
  return result.success;
}

async function hasSubmitted(deviceHash: string, env: Env) {
  const row = await env.DB.prepare(
    "SELECT 1 AS found FROM moments WHERE device_hash = ?1 AND status = 'stored' LIMIT 1",
  )
    .bind(deviceHash)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

async function handleStatus(request: Request, env: Env) {
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  if (!validDeviceId(deviceId)) {
    return json(request, env, { ok: false, error: 'Invalid device identifier.' }, 400);
  }
  const deviceHash = await hashDeviceId(deviceId);
  return json(request, env, {
    ok: true,
    hasSubmitted: await hasSubmitted(deviceHash, env),
  });
}

async function handleUpload(request: Request, env: Env) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_UPLOAD_BYTES + 256 * 1024) {
    return json(request, env, { ok: false, code: 'too_large' }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(request, env, { ok: false, code: 'unreadable_upload' }, 400);
  }

  const deviceId = String(form.get('deviceId') || '');
  if (!validDeviceId(deviceId)) {
    return json(request, env, { ok: false, code: 'device_storage_required' }, 400);
  }
  const deviceHash = await hashDeviceId(deviceId);
  if (await hasSubmitted(deviceHash, env)) {
    return json(request, env, { ok: false, code: 'already_submitted' }, 409);
  }

  const turnstileToken = String(form.get('cf-turnstile-response') || '');
  if (!(await validateTurnstile(turnstileToken, request, env))) {
    return json(request, env, { ok: false, code: 'verification_failed' }, 403);
  }

  const media = form.get('media');
  if (!(media instanceof File)) {
    return json(request, env, { ok: false, code: 'missing_media' }, 400);
  }
  if (media.size === 0 || media.size > MAX_UPLOAD_BYTES) {
    return json(request, env, { ok: false, code: 'too_large' }, 413);
  }

  const contentType = media.type.toLowerCase();
  const extension = allowedTypes.get(contentType);
  if (!extension) {
    return json(request, env, { ok: false, code: 'unsupported_type' }, 415);
  }

  const mediaKind = contentType.startsWith('image/') ? 'photo' : 'video';
  const requestedKind = String(form.get('kind') || '');
  if (requestedKind !== mediaKind) {
    return json(request, env, { ok: false, code: 'type_mismatch' }, 400);
  }

  const duration = Number(form.get('duration') || 0);
  if (
    mediaKind === 'video' &&
    (!Number.isFinite(duration) || duration < 5 || duration > 10)
  ) {
    return json(request, env, { ok: false, code: 'invalid_duration' }, 400);
  }

  const total = await env.DB.prepare(
    'SELECT total_bytes, upload_count FROM storage_totals WHERE id = 1',
  ).first<{ total_bytes: number; upload_count: number }>();
  const maxStorageBytes = Number(env.MAX_STORAGE_BYTES);
  const maxUploadCount = Number(env.MAX_UPLOAD_COUNT);
  if (
    !total ||
    total.total_bytes + media.size > maxStorageBytes ||
    total.upload_count >= maxUploadCount
  ) {
    return json(request, env, { ok: false, code: 'storage_full' }, 507);
  }

  const caption = String(form.get('caption') || '')
    .trim()
    .slice(0, MAX_CAPTION_LENGTH);
  const language = String(form.get('language') || 'en') === 'zh' ? 'zh' : 'en';
  const id = crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const objectKey = `moments/${receivedAt.slice(0, 10)}/${id}.${extension}`;

  try {
    await env.MEDIA.put(objectKey, media.stream(), {
      httpMetadata: { contentType },
      customMetadata: { id, kind: mediaKind, receivedAt },
    });

    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO moments (
          id, device_hash, object_key, original_name, content_type,
          size_bytes, kind, caption, language, duration_seconds, received_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      ).bind(
        id,
        deviceHash,
        objectKey,
        media.name.slice(0, 180),
        contentType,
        media.size,
        mediaKind,
        caption,
        language,
        mediaKind === 'video' ? duration : null,
        receivedAt,
      ),
      env.DB.prepare(
        'UPDATE storage_totals SET total_bytes = total_bytes + ?1, upload_count = upload_count + 1 WHERE id = 1',
      ).bind(media.size),
    ]);

    if (!results.every((result) => result.success)) {
      throw new Error('Metadata storage failed');
    }
  } catch {
    await env.MEDIA.delete(objectKey);
    if (await hasSubmitted(deviceHash, env)) {
      return json(request, env, { ok: false, code: 'already_submitted' }, 409);
    }
    return json(request, env, { ok: false, code: 'save_failed' }, 500);
  }

  return json(request, env, { ok: true, id, kind: mediaKind }, 201);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!originIsAllowed(request, env)) {
        return json(request, env, { ok: false }, 403);
      }
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (!originIsAllowed(request, env)) {
      return json(request, env, { ok: false, code: 'origin_not_allowed' }, 403);
    }

    if (url.pathname !== '/api/moments') {
      return json(request, env, { ok: false, code: 'not_found' }, 404);
    }

    if (request.method === 'GET') return handleStatus(request, env);
    if (request.method === 'POST') return handleUpload(request, env);

    const response = json(request, env, { ok: false, code: 'method_not_allowed' }, 405);
    response.headers.set('Allow', 'GET, POST, OPTIONS');
    return response;
  },
} satisfies ExportedHandler<Env>;
