const BRAND_MARKER = 'data-fup-email="true"';

function escapeHtml(value: string): string {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://funcional-up-digital.vercel.app"
  ).replace(/\/$/, "");
}

function isAlreadyBranded(html: string): boolean {
  const compact = String(html || "").replace(/\s+/g, "").toLowerCase();

  if (compact.includes(BRAND_MARKER.replace(/\s+/g, "").toLowerCase())) {
    return true;
  }

  const hasDarkBackground =
    compact.includes("background:#0a0a0a") ||
    compact.includes("background-color:#0a0a0a");
  const hasBrandAccent =
    compact.includes("#00a19c") ||
    compact.includes("#0aa6a6") ||
    compact.includes("#11b8b0");
  const hasCard = /max-width:\d+px/.test(compact);

  return hasDarkBackground && hasBrandAccent && hasCard;
}

function stripDocumentTags(html: string): string {
  return String(html || "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .trim();
}

function extractFirstHeading(html: string): { title: string | null; content: string } {
  const match = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!match) return { title: null, content: html };

  const title = match[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title: title || null,
    content: html.replace(match[0], "").trim(),
  };
}

function normalizeLegacyColors(html: string): string {
  return html
    .replace(/Funcional VIP Digital/gi, "Funcional UP Digital")
    .replace(/#f5a623/gi, "#00A19C")
    .replace(/#00a19c/gi, "#00A19C")
    .replace(/color\s*:\s*#(?:000000|000|111111|111|222222|222|333333|333|444444|444|555555|555)(?=\s*[;\"])/gi, "color:#d4d4d4")
    .replace(/color\s*:\s*#(?:666666|666|777777|777)(?=\s*[;\"])/gi, "color:#a1a1a1")
    .replace(/background(?:-color)?\s*:\s*#(?:ffffff|fff)(?=\s*[;\"])/gi, "background:#111111");
}

function addDefaultTagStyles(html: string): string {
  let content = html;

  content = content.replace(/<p(?![^>]*\bstyle=)([^>]*)>/gi, '<p$1 style="margin:0 0 14px;color:#d4d4d4;font-size:15px;line-height:1.65;">');
  content = content.replace(/<h([1-3])(?![^>]*\bstyle=)([^>]*)>/gi, '<h$1$2 style="margin:20px 0 12px;color:#00A19C;font-size:18px;line-height:1.35;">');
  content = content.replace(/<ul(?![^>]*\bstyle=)([^>]*)>/gi, '<ul$1 style="margin:0 0 16px;padding-left:22px;color:#d4d4d4;font-size:15px;line-height:1.65;">');
  content = content.replace(/<ol(?![^>]*\bstyle=)([^>]*)>/gi, '<ol$1 style="margin:0 0 16px;padding-left:22px;color:#d4d4d4;font-size:15px;line-height:1.65;">');
  content = content.replace(/<li(?![^>]*\bstyle=)([^>]*)>/gi, '<li$1 style="margin:0 0 8px;">');
  content = content.replace(/<strong(?![^>]*\bstyle=)([^>]*)>/gi, '<strong$1 style="color:#f5f5f5;">');

  content = content.replace(/<a\s+([^>]*?)style=(['"])[\s\S]*?\2([^>]*)>/gi, (_match, before, _quote, after) => {
    return `<a ${before}${after} style="display:inline-block;margin-top:8px;background:#00A19C;color:#081312;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px;">`;
  });
  content = content.replace(/<a(?![^>]*\bstyle=)([^>]*)>/gi, '<a$1 style="display:inline-block;margin-top:8px;background:#00A19C;color:#081312;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px;">');

  return content;
}

export function ensureFuncionalUpEmailHtml(input: {
  subject: string;
  html: string;
}): string {
  const originalHtml = String(input.html || "").trim();

  if (isAlreadyBranded(originalHtml)) {
    return originalHtml;
  }

  const stripped = stripDocumentTags(originalHtml);
  const normalized = normalizeLegacyColors(stripped);
  const extracted = extractFirstHeading(normalized);
  const displayTitle = extracted.title || String(input.subject || "Funcional UP Digital").trim();
  const content = addDefaultTagStyles(extracted.content || '<p>Você recebeu uma nova mensagem do Funcional UP Digital.</p>');
  const logoUrl = `${appBaseUrl()}/branding/symbol-funcional-up-digital.png`;

  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0a0a0a;">
    <table ${BRAND_MARKER} role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;background:#0a0a0a;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:24px 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;background:#111111;border:1px solid #2a2a2a;border-radius:18px;border-collapse:separate;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 10px;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="Funcional UP Digital" style="display:block;width:48px;height:48px;border-radius:999px;object-fit:cover;border:1px solid #00A19C;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;color:#00A19C;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Funcional UP Digital</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 26px;font-family:Arial,sans-serif;color:#d4d4d4;">
                <h1 style="margin:0 0 18px;color:#00A19C;font-family:Arial,sans-serif;font-size:27px;line-height:1.2;font-weight:700;">${escapeHtml(displayTitle)}</h1>
                <div style="color:#d4d4d4;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;">
                  ${content}
                </div>
                <div style="margin-top:24px;padding-top:18px;border-top:1px solid #2a2a2a;">
                  <p style="margin:0;color:#6b7280;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;">Esta é uma mensagem automática do Funcional UP Digital.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
