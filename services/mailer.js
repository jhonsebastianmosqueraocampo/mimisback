const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || "true") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendInviteEmail({ to, code }) {
  const fromName = process.env.SMTP_FROM_NAME || "MIMIS";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = "Tu código de registro para MIMIS (Tienda)";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
    <h2 style="margin:0 0 8px;">Bienvenido a MIMIS 🟢</h2>
    <p style="margin:0 0 14px;">
      Un administrador te invitó a crear tu cuenta de tienda.
    </p>

    <div style="background:#f6f6f6; padding:16px; border-radius:10px; display:inline-block;">
      <div style="font-size:12px; color:#666;">CÓDIGO DE ACCESO</div>
      <div style="font-size:28px; font-weight:800; letter-spacing:3px;">${code}</div>
    </div>

    <p style="margin:18px 0 0;">
      Ingresa este código en el formulario de registro de la tienda.
    </p>

    <p style="margin:10px 0 0; font-size:12px; color:#666;">
      Si tú no solicitaste este acceso, ignora este correo.
    </p>
  </div>
  `;

  // (opcional) validación de conexión en dev:
  // await transporter.verify();

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

async function sendInviteSyntheticEmail({ user }) {
  const fromName = process.env.SMTP_FROM_NAME || "MIMIS";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = "Invitación partido sintética";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
    <h2 style="margin:0 0 8px;">Un miembro de la comunidad ha solicitado partido</h2>
    <p style="margin:0 0 14px;">
      ${user.nickName}
    </p>
    <p style="margin:0 0 14px;">
      ${user.email}
    </p>
  </div>
  `;

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    fromEmail,
    subject,
    html,
  });
}

async function approveInviteSyntheticEmail({ user, match }) {
  const fromName = process.env.SMTP_FROM_NAME || "MIMIS";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = "Aprobación partido sintética";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
    <h2 style="margin:0 0 8px;">Tu solicitud ha sido aprovado. Prépara tu equipo para jugar contra nosotros</h2>
    <p style="margin:0 0 14px;">
      ${user.nickName}
    </p>
    <p style="margin:0 0 14px;">
      Nos vemos en las canchas
    </p>
    <p style="margin:0 0 14px;">
      Ten en cuenta las indicaciones que recibiste vía whatsApp
    </p>
    <p style="margin:0 0 14px;">
      ${match.location}
    </p>
    <p style="margin:0 0 14px;">
      ${match.scheduledAt}
    </p>
  </div>
  `;

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: user.email,
    subject,
    html,
  });
}

async function rejectInviteSyntheticEmail({ user, reason }) {
  const fromName = process.env.SMTP_FROM_NAME || "MIMIS";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = "Respuesta Invitación partido sintética";

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
    <h2 style="margin:0 0 8px;">Tu solicitud ha sido aprovado. Prépara tu equipo para jugar contra nosotros</h2>
    <p style="margin:0 0 14px;">
      ${user.nickName}
    </p>
    <p style="margin:0 0 14px;">
      Tu solicitud de partido sintética ha sido rechazada: ${reason}
    </p>
  </div>
  `;

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: user.email,
    subject,
    html,
  });
}

async function sendStatusEmail({ to, status }) {
  const fromName = process.env.SMTP_FROM_NAME || "MIMIS";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const subject = "Estado Pedido";

  let html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
    <h2 style="margin:0 0 8px;">Actualización estado del pedido</h2>
    <p style="margin:0 0 14px;">
      Su pedido se encuentra confirmado
    </p>
  </div>
  `;

  switch (status) {
    case "confirmed":
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
          <h2 style="margin:0 0 8px;">Actualización estado del pedido</h2>
          <p style="margin:0 0 14px;">
            Su pedido se encuentra confirmado
          </p>
        </div>
        `;
      break;
    case "in_transit":
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
          <h2 style="margin:0 0 8px;">Actualización estado del pedido</h2>
          <p style="margin:0 0 14px;">
            Su pedido se encuentra en tránsito
          </p>
        </div>
        `;
      break;
    case "delivered":
      html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.4; color:#111;">
          <h2 style="margin:0 0 8px;">Actualización estado del pedido</h2>
          <p style="margin:0 0 14px;">
            Se ha entregado tu pedido. Disfrútalo y sigue usando la app Mimis para más alegrias
          </p>
        </div>
        `;
    default:
      break;
  }

  // (opcional) validación de conexión en dev:
  // await transporter.verify();

  return transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
  });
}

module.exports = {
  sendInviteEmail,
  sendInviteSyntheticEmail,
  approveInviteSyntheticEmail,
  rejectInviteSyntheticEmail,
  sendStatusEmail
};
