import { timingSafeEqual } from "node:crypto";

export const safeEqualHex = (aHex: string, bHex: string): boolean => {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
};

export const safeEqualUtf8 = (a: string, b: string): boolean => {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (aa.length !== bb.length) {
    return false;
  }

  return timingSafeEqual(aa, bb);
};
