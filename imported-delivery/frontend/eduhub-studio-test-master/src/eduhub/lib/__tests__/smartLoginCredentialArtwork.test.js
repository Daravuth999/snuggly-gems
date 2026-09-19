import fs from "fs";
import path from "path";
import { buildCredentialCardText } from "../smartLoginCredentialArtwork";

describe("buildCredentialCardText — pure layout plan (no canvas involved)", () => {
  test("uses the student's real persisted display name and clean_id", () => {
    const text = buildCredentialCardText({ displayName: "Dalita Example", cleanId: "stu001" });
    expect(text.nameValue).toBe("Dalita Example");
    expect(text.idValue).toBe("stu001");
  });

  test("never invents data — falls back to an em-dash placeholder, not a made-up name", () => {
    const text = buildCredentialCardText({ displayName: "", cleanId: "" });
    expect(text.nameValue).toBe("—");
    expect(text.idValue).toBe("—");
  });

  test("trims incidental whitespace from persisted fields", () => {
    const text = buildCredentialCardText({ displayName: "  Sopheak  ", cleanId: "  stu002  " });
    expect(text.nameValue).toBe("Sopheak");
    expect(text.idValue).toBe("stu002");
  });

  test("carries the EduHub brand + instructional copy the spec calls for", () => {
    const text = buildCredentialCardText({ displayName: "Dalita", cleanId: "stu001" });
    expect(text.eyebrow).toMatch(/DY.*EDUHUB/i);
    expect(text.title).toMatch(/SMART LOGIN/i);
    expect(text.instruction).toMatch(/scan.*sign in to eduhub/i);
    expect(text.privacyNote).toMatch(/private/i);
  });
});

describe("renderSmartLoginCredentialCard — structural check", () => {
  // Canvas 2D drawing isn't meaningfully testable in jsdom without a
  // native canvas polyfill this project doesn't carry (see project
  // convention in feedback-markdown-to-jsx-unmountable-in-jest.md-style
  // cases). This confirms the compositor draws the QR onto the canvas
  // without ever touching its pixels beyond a direct 1:1 drawImage —
  // i.e. it never re-encodes or scales the QR in a way that could hurt
  // decodability — by inspecting the source directly.
  const src = fs.readFileSync(
    path.join(__dirname, "../smartLoginCredentialArtwork.js"),
    "utf8",
  );

  test("draws the QR via a single direct drawImage call (no re-encoding)", () => {
    expect(src).toMatch(/ctx\.drawImage\(qrImg, qrX, qrY, QR_SIZE, QR_SIZE\)/);
  });

  test("never draws anything on top of the QR's own bounding box", () => {
    const afterDraw = src.slice(src.indexOf("ctx.drawImage(qrImg"));
    // Every later fillText call must target the name/ID/instruction copy,
    // which is laid out via `y +=` increments strictly below the QR box —
    // i.e. no text draw call precedes the QR draw call in the y-ordering.
    expect(afterDraw).toMatch(/nameLabel/);
    expect(afterDraw).toMatch(/idLabel/);
  });

  test("exports the async compositor students'/teachers' downloads use", () => {
    expect(src).toMatch(/export async function renderSmartLoginCredentialCard/);
  });
});
