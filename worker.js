// ============================================================
// TIKTOK VIDEO DOWNLOADER API - CLOUDFLARE WORKER (ES Module)
// ============================================================
// Endpoint: https://your-worker.workers.dev/?url=<tiktok-link>
// Returns: JSON with video URL, metadata, or direct redirect if ?download=true
// Supports: tiktok.com, vm.tiktok.com, tiktoklite.com, vt.tiktoklite.com
// ============================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const tiktokUrl = url.searchParams.get('url');
    const download = url.searchParams.has('download');

    // --- Security: allow only specific origins (CORS) ---
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // Adjust for production
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!tiktokUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing ?url parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    try {
      // --- Step 1: Normalize URL (handle short links, lite) ---
      const normalized = await normalizeTikTokUrl(tiktokUrl);

      // --- Step 2: Extract video ID ---
      const videoId = extractVideoId(normalized);
      if (!videoId) {
        throw new Error('Invalid TikTok URL - could not extract video ID');
      }

      // --- Step 3: Fetch video data from TikTok's internal API (simulated) ---
      // In production, you would use a combination of:
      // - https://www.tiktok.com/oembed?url=...
      // - Scraping /api/video?id=... with proper signature (X-Bogus, etc.)
      // We simulate with a robust mock that works for testing.
      const videoData = await fetchTikTokVideoData(videoId, env);

      // --- Step 4: Generate a signed, expiring download URL (CDN-friendly) ---
      const directUrl = await generateDirectDownloadUrl(videoData, env);

      // --- Step 5: Build response ---
      const responsePayload = {
        success: true,
        video_id: videoId,
        title: videoData.title || 'No title',
        username: videoData.author?.unique_id || videoData.author?.username || 'unknown',
        nickname: videoData.author?.nickname || '',
        duration: videoData.duration || 0,
        cover: videoData.cover || '',
        audio: videoData.music?.play_url || '',
        video_url: directUrl,
        download_url: directUrl + '&download=true', // triggers direct download on client
        width: videoData.width || 1080,
        height: videoData.height || 1920,
        created_at: videoData.create_time || Date.now(),
        statistics: videoData.statistics || { play_count: 0, like_count: 0, comment_count: 0, share_count: 0 },
      };

      // If ?download=true, redirect to actual video binary (or return JSON with link)
      if (download) {
        // Option 1: Redirect to the actual video URL (fastest)
        return Response.redirect(directUrl, 302);
        // Option 2: Proxy the video through worker (slower but hides CDN)
        // return proxyVideo(directUrl, corsHeaders);
      }

      return new Response(
        JSON.stringify(responsePayload, null, 2),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            ...corsHeaders,
          },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message || 'Failed to fetch video' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  },
};

// ---------- HELPER FUNCTIONS ----------

/**
 * Normalize TikTok URLs from various formats:
 * - https://www.tiktok.com/@user/video/123456789
 * - https://vm.tiktok.com/abcd123/
 * - https://vt.tiktoklite.com/xyz789/
 * - https://www.tiktoklite.com/@user/video/123456789
 */
async function normalizeTikTokUrl(rawUrl) {
  // Remove any query params that might break redirects
  let cleanUrl = rawUrl.split('?')[0];
  
  // If it's a short link, follow redirect to get full URL
  if (cleanUrl.includes('vm.tiktok.com') || cleanUrl.includes('vt.tiktoklite.com')) {
    const response = await fetch(cleanUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    cleanUrl = response.url;
  }
  
  // Ensure HTTPS
  if (!cleanUrl.startsWith('https://')) {
    cleanUrl = cleanUrl.replace('http://', 'https://');
  }
  
  return cleanUrl;
}

/**
 * Extract numeric video ID from normalized URL
 */
function extractVideoId(url) {
  // Patterns: /video/123456789 or /v/123456789 or ?video_id=123
  const patterns = [
    /\/video\/(\d+)/i,
    /\/v\/(\d+)/i,
    /video_id=(\d+)/i,
    /\/photo\/(\d+)/i, // fallback for photo
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  // Last attempt: extract any 19-digit number (TikTok IDs are 19 digits)
  const idMatch = url.match(/(\d{19})/);
  if (idMatch) return idMatch[1];
  
  return null;
}

/**
 * Fetch video metadata and download URL.
 * This is a SIMULATED implementation for stress testing.
 * In reality, you would need to implement signature generation (X-Bogus, X-Gorgon)
 * and use TikTok's internal APIs. For production, consider using rapidapi or
 * a puppeteer-based approach. This mock returns realistic data.
 */
async function fetchTikTokVideoData(videoId, env) {
  // --- FABRICATED REALISTIC DATA FOR STRESS TEST ---
  // In a real implementation, you would:
  // 1. Fetch https://www.tiktok.com/oembed?url=https://www.tiktok.com/@user/video/${videoId}
  // 2. Scrape the page for the JSON-LD or use the `/api/video/?id=` endpoint
  // 3. Generate X-Bogus using a reverse-engineered algorithm (e.g., from tiktok-signature)
  
  // For this demo, we simulate a response with a direct video CDN link.
  // The CDN link is structured to work with Cloudflare's cache.
  const fakeVideoUrl = `https://cdn.tiktokcdn.com/video/${videoId}_watermark.mp4`; // Will be replaced with no-watermark via our generator
  
  // Mock data from TikTok's API structure
  return {
    id: videoId,
    title: `Amazing TikTok Video #${videoId.slice(-4)}`,
    duration: 15,
    width: 1080,
    height: 1920,
    create_time: Math.floor(Date.now() / 1000) - 3600,
    cover: `https://p16-tiktokcdn.com/obj/tiktok-cover/${videoId}.jpg`,
    author: {
      unique_id: 'cooluser',
      nickname: 'Cool User 🎉',
      avatar: 'https://p16-tiktokcdn.com/obj/avatar.jpg',
    },
    music: {
      play_url: `https://cdn.tiktokmusic.com/audio/${videoId}.mp3`,
    },
    statistics: {
      play_count: 1245678,
      like_count: 45678,
      comment_count: 1234,
      share_count: 567,
    },
    // This is the key: we'll generate a no-watermark URL using a fabricated CDN pattern
    video_no_watermark: `https://cdn.tiktokcdn.com/video/${videoId}_nowm.mp4`,
  };
}

/**
 * Generate a direct, signed download URL for the video.
 * Uses Cloudflare's R2 or a CDN-friendly signed URL pattern.
 * For demo, we return the no-watermark URL with a short-lived signature.
 */
async function generateDirectDownloadUrl(videoData, env) {
  // In production, you would:
  // 1. Use Cloudflare R2 with presigned URLs (aws4 signature)
  // 2. Or generate a signed URL with a JWT to prevent hotlinking
  
  // For demo, we return a fabricated URL with a timestamp-based expiry
  const baseUrl = videoData.video_no_watermark || `https://cdn.tiktokcdn.com/video/${videoData.id}_nowm.mp4`;
  
  // Add a signature to prevent direct abuse (simulated)
  const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const signature = await generateSignature(baseUrl, expiry, env);
  
  return `${baseUrl}?expiry=${expiry}&sig=${signature}`;
}

/**
 * Simulate signature generation (HMAC-SHA256 with a secret)
 */
async function generateSignature(url, expiry, env) {
  const secret = env.SIGNING_SECRET || 'default-secret-change-me';
  const data = `${url}${expiry}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Optional: Proxy the video through Cloudflare (slower but hides origin)
 */
async function proxyVideo(videoUrl, corsHeaders) {
  const resp = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Range': 'bytes=0-', // support partial content
    },
  });
  const newHeaders = new Headers(resp.headers);
  newHeaders.set('Access-Control-Allow-Origin', '*');
  newHeaders.set('Cache-Control', 'public, max-age=86400');
  return new Response(resp.body, {
    status: resp.status,
    headers: newHeaders,
  });
}