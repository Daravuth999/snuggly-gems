// smartLoginCredentialArtwork.js — composites a professional, personal
// "credential card" PNG around an existing Smart Login QR code.
//
// SECURITY NOTE: this module never touches the authentication payload. It
// takes the QR PNG the backend already rendered (student_smart_login.py's
// _render_qr — pure QR of the opaque credential, unchanged) and draws it,
// pixel-for-pixel, onto a larger canvas alongside the student's display
// name and ID as plain text. The QR itself is never re-encoded, scaled
// down destructively, or overlaid with anything — decodability is
// preserved because the composited frame only ever ADDS whitespace and
// text OUTSIDE the QR's own bounding box, never inside it.
//
// Everything below runs entirely client-side (Canvas 2D) — no new backend
// dependency, no new external service, no change to what the QR encodes.

const CARD_WIDTH = 640;
const CARD_HEIGHT = 900;
const QR_BOX = 480; // the white quiet-zone box the QR sits inside
const QR_SIZE = 420; // the QR image itself, centered inside QR_BOX

const COLORS = {
  bg: "#FFFFFF",
  border: "#EDEFF2",
  navy: "#0B1B36",
  blue: "#1A56DB",
  gold: "#D4A843",
  muted: "#6B7280",
  faint: "#9CA3AF",
  qrTile: "#F7F8FA",
};

/**
 * Pure text-layout plan for the credential card — no canvas/Image
 * involved, so this half is fully unit-testable in Jest/jsdom.
 */
export function buildCredentialCardText({ displayName, cleanId }) {
  return {
    eyebrow: "DY · EDUHUB",
    title: "SMART LOGIN",
    nameLabel: "STUDENT NAME",
    nameValue: String(displayName || "").trim() || "—",
    idLabel: "STUDENT ID",
    idValue: String(cleanId || "").trim() || "—",
    instruction: "Scan this QR to sign in to EduHub",
    privacyNote: "Keep this QR private — it signs you in instantly.",
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load QR image"));
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders the full personalized credential card and returns a PNG data
 * URI. This is the function StudentManager.jsx uses for both the
 * on-screen preview and the actual downloaded file, so what a teacher
 * sees is exactly what they save/print.
 */
export async function renderSmartLoginCredentialCard({ qrPngDataUri, displayName, cleanId }) {
  const text = buildCredentialCardText({ displayName, cleanId });
  const qrImg = await loadImage(qrPngDataUri);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");

  // Card background + frame
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 8, 8, CARD_WIDTH - 16, CARD_HEIGHT - 16, 28);
  ctx.stroke();

  let y = 72;

  // Eyebrow: DY · EduHub
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.faint;
  ctx.font = "700 15px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.eyebrow, CARD_WIDTH / 2, y, CARD_WIDTH - 80);
  y += 40;

  // Title: SMART LOGIN
  ctx.fillStyle = COLORS.navy;
  ctx.font = "800 34px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.title, CARD_WIDTH / 2, y);
  y += 30;

  // Gold accent underline
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CARD_WIDTH / 2 - 36, y);
  ctx.lineTo(CARD_WIDTH / 2 + 36, y);
  ctx.stroke();
  y += 48;

  // QR quiet-zone box
  const boxX = (CARD_WIDTH - QR_BOX) / 2;
  ctx.fillStyle = COLORS.qrTile;
  roundRect(ctx, boxX, y, QR_BOX, QR_BOX, 20);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, boxX, y, QR_BOX, QR_BOX, 20);
  ctx.stroke();

  // The QR itself — drawn 1:1 from the backend's own PNG, centered with
  // generous quiet zone on all sides. Never scaled below its natural
  // resolution, never anything drawn on top of it.
  const qrX = (CARD_WIDTH - QR_SIZE) / 2;
  const qrY = y + (QR_BOX - QR_SIZE) / 2;
  ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);
  y += QR_BOX + 44;

  // Student Name
  ctx.fillStyle = COLORS.faint;
  ctx.font = "700 13px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.nameLabel, CARD_WIDTH / 2, y);
  y += 34;
  ctx.fillStyle = COLORS.navy;
  ctx.font = "800 26px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.nameValue, CARD_WIDTH / 2, y, CARD_WIDTH - 80);
  y += 42;

  // Student ID
  ctx.fillStyle = COLORS.faint;
  ctx.font = "700 13px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.idLabel, CARD_WIDTH / 2, y);
  y += 30;
  ctx.fillStyle = COLORS.blue;
  ctx.font = "700 20px Consolas, 'Courier New', monospace";
  ctx.fillText(text.idValue, CARD_WIDTH / 2, y, CARD_WIDTH - 80);
  y += 48;

  // Divider
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, y);
  ctx.lineTo(CARD_WIDTH - 64, y);
  ctx.stroke();
  y += 38;

  // Instruction
  ctx.fillStyle = COLORS.navy;
  ctx.font = "600 16px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.instruction, CARD_WIDTH / 2, y, CARD_WIDTH - 80);
  y += 30;

  // Privacy note
  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 13px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(text.privacyNote, CARD_WIDTH / 2, y, CARD_WIDTH - 80);

  return canvas.toDataURL("image/png");
}
