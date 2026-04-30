// Edge Function: dispara email vía Resend cuando se publica una respuesta a una consulta.
// La invoca un trigger SQL en la tabla `consultas` cuando `respuesta_nawar` pasa de NULL a un valor.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@holandesnawar.nl";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "info@holandesnawar.com";
// CIRCLE_URL: URL de la sección de Consultas dentro de Circle (a donde apunta el botón).
// FRONTEND_URL: URL standalone (Vercel) — fallback si CIRCLE_URL no está configurada.
const CIRCLE_URL = Deno.env.get("CIRCLE_URL") ?? "";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "https://consultas-tau.vercel.app";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  if (payload.type !== "UPDATE" || payload.table !== "consultas") {
    return new Response("Not interested", { status: 200 });
  }

  const oldReply = (payload.old_record?.respuesta_nawar as string | null) ?? null;
  const newReply = (payload.record?.respuesta_nawar as string | null) ?? null;

  if (!newReply || newReply === oldReply) {
    return new Response("No notification needed", { status: 200 });
  }

  const post = payload.record!;
  const email = post.author_email as string | null;
  if (!email) {
    return new Response("No email to notify", { status: 200 });
  }

  // Sanity check: no enviar a emails de prueba evidentes
  const lowerEmail = email.toLowerCase().trim();
  if (lowerEmail.includes('test@test') || lowerEmail.includes('example.com') || lowerEmail.endsWith('@test.com')) {
    console.warn("Skipping test email:", email);
    return new Response("Test email skipped", { status: 200 });
  }

  const safeName = String(post.author_name ?? "alumno/a").replace(/[<>]/g, "");
  const safeTitle = String(post.title ?? "tu consulta").replace(/[<>]/g, "");

  // Link prioriza Circle (embebido) sobre Vercel (standalone)
  const baseUrl = CIRCLE_URL || FRONTEND_URL;
  const separator = baseUrl.includes("?") ? "&" : "?";
  const link = `${baseUrl}${separator}id=${post.id}`;

  const html = renderEmailHTML({ name: safeName, title: safeTitle, link });
  const text = renderEmailText({ name: safeName, title: safeTitle, link });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `Holandés Nawar <${FROM_EMAIL}>`,
      to: email,
      reply_to: REPLY_TO,
      subject: `Hemos respondido tu consulta: "${safeTitle}"`,
      html,
      text,
    }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Resend error:", result);
    return new Response(JSON.stringify({ error: result }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, id: result.id }), { status: 200 });
});

// =================== EMAIL TEMPLATE ===================
function renderEmailHTML({ name, title, link }: { name: string; title: string; link: string }) {
  const BANNER_URL = "https://docs.holandesnawar.com/img/Banner.mail.png";
  const LOGO_URL = "https://docs.holandesnawar.com/img/Nawar.png";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Respuesta a tu consulta · Holandés Nawar</title>
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  /* Forzar colores en modo oscuro de Gmail/Apple Mail/Outlook */
  @media (prefers-color-scheme: dark) {
    body, table, td, div, p, h1, h2, h3, h4, span, a {
      background-color: revert !important;
      color: revert !important;
    }
  }
  [data-ogsc] body, [data-ogsc] table { background-color: #f1f5f9 !important; }
  u + .body .gmail-fix { color: revert !important; }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Helvetica,Arial,sans-serif;color:#0C0C1E;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">Tienes nueva respuesta a "${title}".</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.05);">

        <!-- BANNER imagen -->
        <tr><td style="padding:0;line-height:0;font-size:0;">
          <img src="${BANNER_URL}" alt="Holandés Nawar" width="560" style="display:block;width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>

        <!-- BODY -->
        <tr><td style="padding:36px 36px 8px;">
          <div style="display:inline-block;background:#1D0084;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:6px 14px;border-radius:999px;text-transform:uppercase;margin-bottom:18px;">
            ✓ Consulta resuelta
          </div>
          <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#0C0C1E;line-height:1.25;">
            ${name}, ya tenemos tu respuesta
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
            Acabamos de responder a tu consulta. Pulsa el botón para leerla en la comunidad.
          </p>

          <!-- Question card sin línea izquierda -->
          <div style="background:#F0F5FF;border:1px solid #DDE6F5;border-radius:12px;padding:18px 22px;margin:0 0 28px;">
            <div style="font-size:11px;font-weight:700;color:#1D0084;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Tu consulta</div>
            <div style="font-size:16px;font-weight:600;color:#0C0C1E;line-height:1.4;">${title}</div>
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 36px 40px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:12px;background:#1D0084;">
            <a href="${link}" style="display:inline-block;background:#1D0084;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 36px;border-radius:12px;letter-spacing:0.2px;">
              Ver respuesta
            </a>
          </td></tr></table>
        </td></tr>

        <!-- FOOTER: logo arriba, texto abajo -->
        <tr><td style="background:#F0F5FF;padding:28px 36px;border-top:1px solid #DDE6F5;text-align:center;">
          <img src="${LOGO_URL}" alt="Holandés Nawar" height="28" style="display:inline-block;height:28px;width:auto;border:0;margin-bottom:12px;" />
          <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">
            ¿Dudas? Escríbenos a <a href="mailto:${REPLY_TO}" style="color:#1D0084;text-decoration:none;font-weight:600;">${REPLY_TO}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderEmailText({ name, title, link }: { name: string; title: string; link: string }) {
  return `Hola ${name},

Hemos respondido a tu consulta:
"${title}"

Léela aquí: ${link}

— Equipo Holandés Nawar
${REPLY_TO}`;
}
