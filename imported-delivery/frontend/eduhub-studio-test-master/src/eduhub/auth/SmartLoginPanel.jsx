// SmartLoginPanel.jsx — EduHub Smart Login (QR scan/upload) entry point.
//
// Self-contained: owns camera lifecycle, file-picker upload, and
// client-side pixel decoding (jsQR). Decoding a QR into a string is a
// mechanical step — this component NEVER decides whether the result is a
// valid credential; it only extracts the text and hands it up via
// `onDecoded`. The backend (student_smart_login.py, POST
// /api/auth/student/smart-login) is where the real, only, validity
// decision happens.
//
// jsQR is the one new frontend dependency this feature adds — the
// smallest pure-JS QR decoder available (no WASM, no native deps), and it
// works identically against a canvas ImageData buffer for BOTH modes (a
// live camera frame and a picked image file), so one small library covers
// both UI paths instead of two.
//
// The image itself never leaves the device for the upload path — decoding
// happens entirely in a local <canvas>, so there is no raw-image upload to
// bound server-side; the size/MIME guard below exists purely so a huge or
// bogus local file never hangs the browser trying to decode it.
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Upload, X, AlertTriangle, QrCode } from "lucide-react";

// Matches the backend's own existing image ceiling (hero_artwork_tools.py
// HARD_MAX_IMAGE_BYTES) — same limit, enforced here since this image never
// reaches the server at all.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

export default function SmartLoginPanel({ onDecoded, onCancel, theme = "dark" }) {
  const light = theme === "light";
  const [mode, setMode] = useState("choose"); // choose | camera
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const fileInputRef = useRef(null);
  const decodedRef = useRef(false); // guards against a double-fire between the rAF loop and cleanup

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Attaches the live stream to the <video> element once it's actually in
  // the DOM. The element only renders when mode === "camera" (see the
  // ternary below), so doing this inside startCamera() itself was a no-op:
  // videoRef.current was still null at the moment the stream resolved,
  // srcObject never got set, and students saw a black box (camera
  // permission granted, stream live, just never wired to the element).
  useEffect(() => {
    if (mode !== "camera") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      /* tick()'s own readyState poll below covers a delayed/blocked start */
    });
  }, [mode]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (decodedRef.current) return;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let result = null;
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      result = jsQR(imageData.data, imageData.width, imageData.height);
    } catch {
      /* transient frame read failure — just try the next frame */
    }
    if (result && result.data) {
      decodedRef.current = true;
      stopCamera();
      setScanning(false);
      onDecoded(result.data);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onDecoded, stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access isn't supported on this device. Use Upload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      decodedRef.current = false;
      setMode("camera");
      setScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "Camera permission was denied. Use Upload instead, or allow camera access and try again."
          : "Couldn't start the camera. Use Upload instead.",
      );
    }
  }, [tick]);

  const handleFile = useCallback(
    (file) => {
      setError(null);
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("That file doesn't look like a QR image (PNG, JPG, or WEBP only).");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`Image is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB).`);
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const canvas = canvasRef.current || document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result && result.data) {
            onDecoded(result.data);
          } else {
            setError("Couldn't find a QR code in that image. Try a clearer photo.");
          }
        } catch {
          setError("Couldn't read that image. Try a different file.");
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        setError("Couldn't read that image. Try a different file.");
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    [onDecoded],
  );

  const cancel = () => {
    stopCamera();
    setMode("choose");
    onCancel?.();
  };

  return (
    <div data-testid="smart-login-panel" className="space-y-4">
      {mode === "camera" ? (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-6 border-2 rounded-2xl pointer-events-none" style={{ borderColor: "rgba(217,184,114,0.85)" }} aria-hidden />
          <button
            type="button"
            onClick={cancel}
            data-testid="smart-login-camera-cancel"
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center text-white"
            aria-label="Cancel scan"
          >
            <X className="h-4 w-4" />
          </button>
          {scanning && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-white/90 bg-black/50 rounded-full px-3 py-1">
              Scanning… point at your EduHub QR code
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Decorative QR-scan illustration — NOT a real/scannable code.
              Purely communicates "this is where your QR goes" before the
              student taps Scan or Upload; the actual credential QR only
              ever comes from the student's own camera/gallery. */}
          <div
            className="mx-auto relative flex items-center justify-center"
            style={{ width: 108, height: 108 }}
            aria-hidden="true"
            data-testid="smart-login-qr-illustration"
          >
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                background: light ? "#F7F8FA" : "rgba(255,255,255,0.04)",
                border: `1px solid ${light ? "#EDEFF2" : "rgba(255,255,255,0.12)"}`,
              }}
            />
            {/* Corner brackets — the universal "align your QR here" affordance */}
            {[
              { top: 8, left: 8, borderWidth: "3px 0 0 3px", borderRadius: "8px 0 0 0" },
              { top: 8, right: 8, borderWidth: "3px 3px 0 0", borderRadius: "0 8px 0 0" },
              { bottom: 8, left: 8, borderWidth: "0 0 3px 3px", borderRadius: "0 0 0 8px" },
              { bottom: 8, right: 8, borderWidth: "0 3px 3px 0", borderRadius: "0 0 8px 0" },
            ].map((pos, i) => (
              <span
                key={i}
                className="absolute"
                style={{
                  ...pos,
                  width: 18,
                  height: 18,
                  borderStyle: "solid",
                  borderColor: "#D9B872",
                }}
              />
            ))}
            <QrCode
              className="relative"
              style={{ width: "44%", height: "44%", color: light ? "#0B1B36" : "#FFFFFF", opacity: 0.28 }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={startCamera}
              data-testid="smart-login-scan-btn"
              className="flex flex-col items-center gap-1 rounded-xl py-2.5 px-2 border transition"
              style={{
                minHeight: 44,
                background: light ? "#0B1B36" : "#FFFFFF",
                borderColor: light ? "#0B1B36" : "transparent",
                color: light ? "#FFFFFF" : "#0B1B36",
                boxShadow: light ? "0 12px 28px -16px rgba(11,27,54,0.55)" : "none",
              }}
            >
              <Camera className="h-4 w-4" />
              <span className="text-[12px] font-bold uppercase tracking-wide leading-none">Scan QR</span>
              <span className="text-[10px] font-medium opacity-70 normal-case tracking-normal leading-none">
                Use your camera
              </span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              data-testid="smart-login-upload-btn"
              className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-2 border transition ${
                light
                  ? "border-[#EDEFF2] bg-white hover:bg-[#F7F8FA] text-[#0B1B36]"
                  : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-white"
              }`}
              style={{ minHeight: 44 }}
            >
              <Upload className="h-4 w-4" />
              <span className="text-[12px] font-bold uppercase tracking-wide leading-none">Upload QR</span>
              <span className="text-[10px] font-medium opacity-70 normal-case tracking-normal leading-none">
                From gallery
              </span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-testid="smart-login-file-input"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {error && (
        <div
          data-testid="smart-login-error"
          className={`rounded-xl px-3 py-2.5 text-sm border flex items-start gap-2 ${
            light
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-aurora-magenta/10 border-aurora-magenta/30 text-aurora-magenta"
          }`}
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
