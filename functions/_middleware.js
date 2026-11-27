// Send visitors of the pages.dev address to the real one (preview deployments are left alone).
const NEW_ORIGIN = "https://2024-character-sheet-filler.yansquared.com";
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === "2024-character-sheet-filler.pages.dev" && (request.method === "GET" || request.method === "HEAD")) {
    return new Response(null, { status: 301, headers: { Location: NEW_ORIGIN + url.pathname + url.search, "Cache-Control": "public, max-age=86400" } });
  }
  return next();
}
