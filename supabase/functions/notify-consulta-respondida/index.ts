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
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Respuesta a tu consulta · Holandés Nawar</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;color:transparent;">Tienes nueva respuesta a "${title}".</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.05);">

        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:32px 32px 28px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:#ffffff;width:48px;height:48px;border-radius:14px;text-align:center;vertical-align:middle;line-height:48px;">
                <span style="color:#2563eb;font-size:22px;font-weight:800;letter-spacing:-0.5px;">N</span>
              </td>
              <td style="padding-left:14px;text-align:left;">
                <div style="color:#ffffff;font-weight:700;font-size:18px;line-height:1.2;letter-spacing:-0.3px;">Holandés Nawar</div>
                <div style="color:rgba(255,255,255,0.75);font-size:13px;font-weight:500;margin-top:2px;">Comunidad de aprendizaje</div>
              </td>
            </tr></table>
          </td></tr></table>
        </td></tr>

        <!-- BODY -->
        <tr><td style="padding:36px 36px 8px;">
          <div style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;letter-spacing:1px;padding:6px 12px;border-radius:999px;text-transform:uppercase;margin-bottom:18px;">
            Consulta resuelta
          </div>
          <h1 style="margin:0 0 14px;font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#0f172a;line-height:1.25;">
            Hola ${name}, tenemos respuesta para ti.
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
            Hemos respondido a tu consulta. Pulsa el botón para leerla en la comunidad y, si quieres, dejarnos tus comentarios.
          </p>

          <!-- Question card -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:12px;padding:18px 22px;margin:0 0 28px;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Tu consulta</div>
            <div style="font-size:16px;font-weight:600;color:#0f172a;line-height:1.4;">${title}</div>
          </div>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 36px 36px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:12px;background:#2563eb;">
            <a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:12px;letter-spacing:0.2px;">
              Ver respuesta en la comunidad →
            </a>
          </td></tr></table>
          <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">
            ¿No te abre el botón? Copia esta dirección:<br>
            <a href="${link}" style="color:#2563eb;word-break:break-all;text-decoration:none;">${link}</a>
          </p>
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#f8fafc;padding:24px 36px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0f172a;">Holandés Nawar</p>
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
            La comunidad para aprender neerlandés en español.<br>
            ¿Dudas? Escríbenos a <a href="mailto:${REPLY_TO}" style="color:#2563eb;text-decoration:none;">${REPLY_TO}</a>
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
