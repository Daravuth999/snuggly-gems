import fs from "fs";
import path from "path";

// StudentManager.jsx is a large, fetch-heavy component with no existing
// RTL mount harness in this codebase — matching the project's established
// pattern for this class of file, this verifies the personalized-QR
// wiring via direct source inspection rather than mounting the whole tree.
const src = fs.readFileSync(
  path.join(__dirname, "../StudentManager.jsx"),
  "utf8",
);

describe("StudentManager.jsx — personalized Smart Login credential wiring", () => {
  test("imports the credential-card compositor", () => {
    expect(src).toMatch(
      /import \{ renderSmartLoginCredentialCard \} from "\.\.\/\.\.\/eduhub\/lib\/smartLoginCredentialArtwork"/,
    );
  });

  test("CredentialCard's QR image and download both use the composited card, falling back to the raw QR", () => {
    const credentialCardSrc = src.slice(
      src.indexOf("function CredentialCard"),
      src.indexOf("function SmartLoginQrCard"),
    );
    expect(credentialCardSrc).toMatch(/useSmartLoginCredentialCard\(\{/);
    expect(credentialCardSrc).toMatch(/src=\{smartCardDataUri \|\| credential\.qr_png_data_uri\}/);
    expect(credentialCardSrc).toMatch(/href=\{smartCardDataUri \|\| credential\.qr_png_data_uri\}/);
  });

  test("SmartLoginQrCard's QR image and download both use the composited card, falling back to the raw QR", () => {
    const smartQrCardSrc = src.slice(src.indexOf("function SmartLoginQrCard"));
    expect(smartQrCardSrc).toMatch(/useSmartLoginCredentialCard\(\{/);
    expect(smartQrCardSrc).toMatch(/src=\{smartCardDataUri \|\| result\.qr_png_data_uri\}/);
    expect(smartQrCardSrc).toMatch(/href=\{smartCardDataUri \|\| result\.qr_png_data_uri\}/);
  });

  test("the compositor is fed the student's real persisted display_name and clean_id, never invented data", () => {
    expect(src).toMatch(/displayName:\s*credential\.display_name/);
    expect(src).toMatch(/cleanId:\s*credential\.clean_id/);
    expect(src).toMatch(/displayName:\s*result\.display_name/);
    expect(src).toMatch(/cleanId:\s*result\.clean_id/);
  });

  test("SecurityPanel (Force All Users to Sign Out) is mounted in the main list view", () => {
    expect(src).toMatch(/import SecurityPanel from "\.\/SecurityPanel"/);
    expect(src).toMatch(/<SecurityPanel \/>/);
  });
});
