// Edge Function: dispara email vía Resend cuando se publica una respuesta a una consulta.
// La invoca un trigger SQL en la tabla `consultas` cuando `respuesta_nawar` pasa de NULL a un valor.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@holandesnawar.nl";
const REPLY_TO = Deno.env.get("REPLY_TO") ?? "info@holandesnawar.com";
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

  // Solo notifica cuando la respuesta APARECE o cambia
  if (!newReply || newReply === oldReply) {
    return new Response("No notification needed", { status: 200 });
  }

  const post = payload.record!;
  const email = post.author_email as string | null;
  if (!email) {
    return new Response("No email to notify", { status: 200 });
  }

  const safeName = String(post.author_name ?? "alumno/a").replace(/[<>]/g, "");
  const safeTitle = String(post.title ?? "tu consulta").replace(/[<>]/g, "");
  const link = `${FRONTEND_URL}/?id=${post.id}`;

  const html = `
    <!DOCTYPE html>
    <html><body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#0f172a;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;width:56px;height:56px;background:#2563eb;border-radius:14px;line-height:56px;text-align:center;color:white;font-size:24px;font-weight:700;">N</div>
        </div>
        <h2 style="color:#1e3a8a;margin:0 0 16px;font-size:22px;">¡Hola ${safeName}!</h2>
        <p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:#334155;">Tenemos respuesta a tu consulta:</p>
        <div style="background:#f1f5f9;padding:16px 20px;border-radius:12px;border-left:4px solid #2563eb;margin:16px 0;">
          <strong style="color:#1e3a8a;font-size:16px;">${safeTitle}</strong>
        </div>
        <p style="text-align:center;margin:32px 0;">
          <a href="${link}" style="background:#2563eb;color:white;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;font-size:15px;">Ver respuesta</a>
        </p>
        <p style="color:#64748b;font-size:13px;margin:24px 0 0;text-align:center;">Si el botón no funciona, copia este enlace:<br/><a href="${link}" style="color:#2563eb;word-break:break-all;">${link}</a></p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;" />
        <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">— Equipo Holandés Nawar</p>
      </div>
    </body></html>
  `;

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
    }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Resend error:", result);
    return new Response(JSON.stringify({ error: result }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, id: result.id }), { status: 200 });
});
