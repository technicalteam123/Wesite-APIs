// backend/http-functions.js
import { ok, badRequest, serverError } from "wix-http-functions";

const API_KEY = "ACBs_9f3c7b2a6a1d4e8f9c0b";

function getHeader(request, name) {
  try {
    const h = request?.headers;
    if (!h) return "";
    if (typeof h.get === "function") return h.get(name) || h.get(name.toLowerCase()) || "";
    return h[name] || h[name.toLowerCase()] || h["x-api-key"] || h["X-API-KEY"] || "";
  } catch (e) {
    return "";
  }
}

// ✅ always return using wix-http-functions helpers (no plain objects)
function authFail() {
  return badRequest({
    body: { error: "Unauthorized", hint: "Send header x-api-key" }
  });
}

function isAuthed(request) {
  const key = getHeader(request, "x-api-key");
  return Boolean(key && key === API_KEY);
}

/**
 * GET https://affirmativecoloringbooks.com/_functions/ping
 */
export function get_ping(request) {
  try {
    if (!isAuthed(request)) return authFail();

    return ok({
      body: { status: "ok", message: "Authorized ping working", ts: new Date().toISOString() }
    });
  } catch (e) {
    return serverError({ body: { error: "ping failed", details: String(e) } });
  }
}
export async function get_blogs(request) {
  try {
    if (!isAuthed(request)) return authFail();

    const limitRaw = request?.query?.limit;
    const limit = Math.min(Math.max(Number(limitRaw || 5), 1), 50);

    const blogModule = await import("wix-blog-backend");

    const res = await blogModule.posts.queryPosts()
      .limit(limit)
      .find();

    const items = (res?.items || []).map((p) => ({
      id: p._id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      firstPublishedDate: p.firstPublishedDate,
      lastPublishedDate: p.lastPublishedDate,
      url: p.url,
      coverImage: p.coverImage
    }));

    return ok({ body: { count: items.length, items } });
  } catch (e) {
    return serverError({ body: { error: "blogs failed", details: String(e) } });
  }
}
/**
 * GET https://affirmativecoloringbooks.com/_functions/products?limit=10
 */
export async function get_products(request) {
  try {
    if (!isAuthed(request)) return authFail();

    const limitRaw = request?.query?.limit;
    const limit = Math.min(Math.max(Number(limitRaw || 10), 1), 100);
    if (!Number.isFinite(limit)) return badRequest({ body: { error: "Invalid limit" } });

    // ✅ Use Wix Stores v2 module
    const storesV2 = await import("wix-stores.v2");
    const res = await storesV2.products.queryProducts().limit(limit).find();

    const items = (res.items || []).map((p) => ({
      id: p._id,
      name: p.name,
      slug: p.slug,
      visible: p.visible,
      price: p.priceData,
      description: p.description,
      media: p.mediaItems
    }));

    return ok({ body: { count: items.length, items } });
  } catch (e) {
    return serverError({ body: { error: "products failed", details: String(e) } });
  }
}
export async function get_blogText(request) {
  try {
    if (!isAuthed(request)) return authFail();

    const slug = request?.query?.slug;
    if (!slug) return badRequest({ body: { error: "Missing slug" } });

    const wixFetch = await import("wix-fetch");

    // ✅ Try likely Wix Blog routes on your site
    const candidates = [
      `https://affirmativecoloringbooks.com/art-therapy-for-adults/${slug}`,
      `https://affirmativecoloringbooks.com/post/${slug}`,
      `https://affirmativecoloringbooks.com/blog/${slug}`,
      `https://affirmativecoloringbooks.com/${slug}` // fallback
    ];

    let html = "";
    let foundUrl = "";

    for (const url of candidates) {
      try {
        const res = await wixFetch.fetch(url, { method: "get" });
        const text = await res.text();

        // Skip obvious 404 pages
        if (
          res.status >= 400 ||
          text.includes("Page Not Found") ||
          text.includes("HTTP ERROR 404") ||
          text.includes("This page can’t be found")
        ) {
          continue;
        }

        // ✅ Found a valid page
        html = text;
        foundUrl = url;
        break;
      } catch (e) {
        // keep trying next url
        continue;
      }
    }

    if (!foundUrl) {
      return badRequest({
        body: {
          error: "Could not resolve blog URL for this slug",
          tried: candidates
        }
      });
    }

    // 2) Extract readable text
    const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
    const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, " ");
    const clean = noStyle
      .replace(/<\/(h1|h2|h3|p|li)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    return ok({
      body: {
        slug,
        url: foundUrl,
        text: clean
      }
    });
  } catch (e) {
    return serverError({ body: { error: "blogText failed", details: String(e) } });
  }
}